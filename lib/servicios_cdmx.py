#!/usr/bin/env python3
"""Servicios CDMX: consulta de tenencia y verificación vehicular por placa.

Diseño (Opción A + Opción B):

* Opción A: petición directa y limpia a un endpoint oficial/autorizado, con
  User-Agent transparente, un retraso aleatorio (jitter de 2 a 5 s) y una
  clave de idempotencia (cabecera ``Idempotency-Key``).
* Opción B: si el portal exige reCAPTCHA / Cloudflare / WAF, o no hay un endpoint
  configurado, el scraper NO intenta saltar la protección: devuelve
  ``{"status": "REQUIRES_VIEWPORT_FALLBACK"}`` y la app abre el portal oficial en
  el WebView integrado para que la persona lo resuelva.

Solo usa la biblioteca estándar de Python (sin dependencias).

Contrato de salida (siempre un dict, nunca lanza excepciones):

    {"status": "OK", "tipo": ..., "placa": ..., "datos": {...}}
    {"status": "REQUIRES_VIEWPORT_FALLBACK", "tipo": ..., "reason": ..., "url_oficial": ...}
    {"status": "UNKNOWN", "reason": "timeout"}   # no se sabe si el portal procesó la petición
    {"status": "ERROR", "reason": ...}

``UNKNOWN`` significa "no reintentar de inmediato": el backend lo registra y
aplica un tiempo de espera antes de volver a contactar al portal.

Uso:

    python lib/servicios_cdmx.py tenencia ABC-1234
    CDMX_SCRAPER_TOKEN=... python lib/servicios_cdmx.py serve      # servicio HTTP

Variables de entorno:

    TENENCIA_API_URL / VERIFICACION_API_URL   Endpoint HTTPS *.gob.mx con "{placa}".
    CDMX_CONTACT_URL                          Contacto incluido en el User-Agent.
    CDMX_SCRAPER_TOKEN                        Token Bearer del modo ``serve`` (obligatorio).
    PORT                                      Puerto del modo ``serve`` (8080).

Uso responsable: una consulta por solicitud de la persona usuaria, sin
automatización masiva, y solo contra endpoints documentados o autorizados.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import random
import re
import socket
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable, Dict, Optional, Sequence
from urllib.parse import urlparse

FALLBACK = "REQUIRES_VIEWPORT_FALLBACK"

CONTACT_URL = os.environ.get("CDMX_CONTACT_URL", "https://papeleria-flax.vercel.app")
USER_AGENT = (
    f"PapeleriaArcoiris/1.0 (+{CONTACT_URL}; consulta individual solicitada por la persona usuaria)"
)

JITTER_SEGUNDOS = (2.0, 5.0)
TIMEOUT_SEGUNDOS = 15.0
MAX_BYTES_RESPUESTA = 1_000_000
MAX_BYTES_DATOS = 20_000

_PLACA_VALIDA = re.compile(r"^[A-Z0-9]{5,8}$")

# Señales de reCAPTCHA / Cloudflare / WAF en el cuerpo de la respuesta.
_MARCAS_CAPTCHA = (
    "g-recaptcha",
    "recaptcha/api",
    "hcaptcha",
    "cf-challenge",
    "challenge-platform",
    "just a moment...",
    "attention required",
    "cf-turnstile",
    "captcha",
)


class PlacaInvalida(ValueError):
    """La placa no tiene un formato utilizable después de limpiarla."""


def normalizar_placa(cruda: Any) -> str:
    """Quita acentos, espacios, guiones y símbolos; deja letras y números en mayúsculas."""
    texto = unicodedata.normalize("NFKD", str(cruda or ""))
    texto = "".join(c for c in texto if not unicodedata.combining(c)).upper()
    placa = re.sub(r"[^A-Z0-9]", "", texto)
    if not _PLACA_VALIDA.match(placa):
        raise PlacaInvalida("La placa debe tener entre 5 y 8 letras o números.")
    return placa


def detectar_proteccion(status: int, headers: Dict[str, str], cuerpo: str) -> Optional[str]:
    """Devuelve el motivo si la respuesta es un desafío CAPTCHA/WAF, o None."""
    h = {k.lower(): str(v).lower() for k, v in headers.items()}
    if h.get("cf-mitigated") == "challenge":
        return "cloudflare_challenge"
    if status == 429:
        return "limite_de_peticiones"
    # Un JSON válido con status < 400 no es un desafío: evita falsos positivos
    # por una clave inocua como {"captcha": false}.
    es_json = status < 400 and cuerpo.lstrip()[:1] in ("{", "[")
    muestra = cuerpo[:20_000].lower()
    if not es_json and any(marca in muestra for marca in _MARCAS_CAPTCHA):
        return "captcha"
    if status in (403, 503):
        return "waf_bloqueo"
    return None


def _respuesta_fallback(tipo: str, motivo: str, url_oficial: str) -> Dict[str, Any]:
    return {"status": FALLBACK, "tipo": tipo, "reason": motivo, "url_oficial": url_oficial}


def _primero(bruto: Any, claves: Sequence[str]) -> Any:
    """Busca la primera clave presente en el nivel superior o un nivel anidado."""
    if not isinstance(bruto, dict):
        return None
    for clave in claves:
        if clave in bruto and bruto[clave] not in (None, ""):
            return bruto[clave]
    for valor in bruto.values():
        if isinstance(valor, dict):
            for clave in claves:
                if clave in valor and valor[clave] not in (None, ""):
                    return valor[clave]
    return None


class GovScraper:
    """Base común: jitter, User-Agent, idempotencia, detección de WAF y timeouts."""

    tipo = ""
    url_oficial = ""
    variable_endpoint = ""

    def __init__(
        self,
        jitter: Sequence[float] = JITTER_SEGUNDOS,
        timeout: float = TIMEOUT_SEGUNDOS,
        dormir: Callable[[float], None] = time.sleep,
    ) -> None:
        self.jitter = (float(jitter[0]), float(jitter[1]))
        self.timeout = timeout
        self._dormir = dormir

    # -- configuración -----------------------------------------------------
    def endpoint(self, placa: str) -> Optional[str]:
        plantilla = os.environ.get(self.variable_endpoint, "").strip()
        if not plantilla:
            return None
        return plantilla.replace("{placa}", placa)

    @staticmethod
    def _endpoint_permitido(url: str) -> bool:
        partes = urlparse(url)
        host = (partes.hostname or "").lower()
        return partes.scheme == "https" and host.endswith(".gob.mx")

    def clave_idempotencia(self, placa: str, ventana: int = 600) -> str:
        """Clave estable dentro de una ventana (10 min): mismos datos -> misma clave."""
        base = f"{self.tipo}:{placa}:{int(time.time() // ventana)}"
        return hashlib.sha256(base.encode("utf-8")).hexdigest()

    # -- red ---------------------------------------------------------------
    def _esperar(self) -> None:
        """Retraso aleatorio para no saturar los portales públicos."""
        self._dormir(random.uniform(*self.jitter))

    def _abrir(self, req: urllib.request.Request):
        return urllib.request.urlopen(req, timeout=self.timeout)  # noqa: S310 (https verificado)

    def _peticion(self, url: str, clave: str):
        req = urllib.request.Request(
            url,
            method="GET",
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "application/json",
                "Accept-Language": "es-MX,es;q=0.9",
                "Idempotency-Key": clave,
            },
        )
        try:
            with self._abrir(req) as resp:
                cuerpo = resp.read(MAX_BYTES_RESPUESTA).decode("utf-8", "replace")
                return resp.status, dict(resp.headers.items()), cuerpo
        except urllib.error.HTTPError as err:
            cuerpo = err.read(MAX_BYTES_RESPUESTA).decode("utf-8", "replace")
            return err.code, dict(err.headers.items()), cuerpo

    # -- API pública -------------------------------------------------------
    def consultar(self, placa_cruda: Any, clave_idempotencia: Optional[str] = None) -> Dict[str, Any]:
        try:
            placa = normalizar_placa(placa_cruda)
        except PlacaInvalida as err:
            return {"status": "ERROR", "tipo": self.tipo, "reason": "placa_invalida", "detail": str(err)}

        url = self.endpoint(placa)
        if not url:
            return _respuesta_fallback(self.tipo, "endpoint_no_configurado", self.url_oficial)
        if not self._endpoint_permitido(url):
            return {"status": "ERROR", "tipo": self.tipo, "reason": "endpoint_no_permitido"}

        clave = clave_idempotencia or self.clave_idempotencia(placa)
        self._esperar()

        try:
            status, headers, cuerpo = self._peticion(url, clave)
        except (socket.timeout, TimeoutError):
            return {"status": "UNKNOWN", "tipo": self.tipo, "reason": "timeout"}
        except urllib.error.URLError as err:
            motivo = "timeout" if isinstance(err.reason, (socket.timeout, TimeoutError)) else "red"
            return {"status": "UNKNOWN", "tipo": self.tipo, "reason": motivo}
        except OSError:
            return {"status": "UNKNOWN", "tipo": self.tipo, "reason": "red"}

        proteccion = detectar_proteccion(status, headers, cuerpo)
        if proteccion:
            return _respuesta_fallback(self.tipo, proteccion, self.url_oficial)
        if status >= 500:
            # El portal pudo haber procesado la petición: no se reintenta de inmediato.
            return {"status": "UNKNOWN", "tipo": self.tipo, "reason": f"portal_{status}"}
        if status >= 400:
            return {"status": "ERROR", "tipo": self.tipo, "reason": f"http_{status}"}

        try:
            bruto = json.loads(cuerpo)
        except ValueError:
            # HTML (login, captcha oculto, redirección): se resuelve en el WebView.
            return _respuesta_fallback(self.tipo, "respuesta_no_json", self.url_oficial)

        datos = self.normalizar(bruto)
        datos["placa"] = placa
        if len(json.dumps(datos, ensure_ascii=False)) > MAX_BYTES_DATOS:
            datos.pop("crudo", None)
        return {"status": "OK", "tipo": self.tipo, "placa": placa, "datos": datos}

    def normalizar(self, bruto: Any) -> Dict[str, Any]:  # pragma: no cover - lo define cada subclase
        return {"crudo": bruto}


class TenenciaScraper(GovScraper):
    tipo = "tenencia"
    url_oficial = "https://data.finanzas.cdmx.gob.mx/Front_ten/"
    variable_endpoint = "TENENCIA_API_URL"

    # Los nombres de campo son tolerantes: ajústalos al contrato del endpoint autorizado.
    def normalizar(self, bruto: Any) -> Dict[str, Any]:
        return {
            "adeudo_total": _primero(bruto, ("adeudo_total", "adeudoTotal", "total", "monto_total")),
            "ejercicios": _primero(bruto, ("ejercicios", "anios", "años", "periodos")),
            "linea_captura": _primero(bruto, ("linea_captura", "lineaCaptura")),
            "vigencia": _primero(bruto, ("vigencia", "fecha_vigencia", "vigente_hasta")),
            "crudo": bruto,
        }


class VerificacionScraper(GovScraper):
    tipo = "verificacion"
    url_oficial = "https://sedema.cdmx.gob.mx/servicios/servicio/tramites-y-servicios-de-verificacion-vehicular"
    variable_endpoint = "VERIFICACION_API_URL"

    def normalizar(self, bruto: Any) -> Dict[str, Any]:
        return {
            "estatus": _primero(bruto, ("estatus", "estado", "status")),
            "holograma": _primero(bruto, ("holograma", "engomado")),
            "vigencia": _primero(bruto, ("vigencia", "vigente_hasta", "fecha_vigencia")),
            "proxima_verificacion": _primero(bruto, ("proxima_verificacion", "proximaVerificacion", "periodo")),
            "cita": _primero(bruto, ("cita", "cita_programada", "fecha_cita")),
            "crudo": bruto,
        }


SCRAPERS = {"tenencia": TenenciaScraper, "verificacion": VerificacionScraper}


def consultar_placa(
    tipo: str,
    placa: Any,
    clave_idempotencia: Optional[str] = None,
    **opciones: Any,
) -> Dict[str, Any]:
    """Función unificada: limpia la placa, aplica jitter y consulta el servicio ``tipo``."""
    clase = SCRAPERS.get(str(tipo))
    if clase is None:
        return {"status": "ERROR", "reason": "tipo_desconocido"}
    try:
        return clase(**opciones).consultar(placa, clave_idempotencia)
    except Exception:  # noqa: BLE001 - el contrato es no lanzar nunca
        return {"status": "ERROR", "tipo": str(tipo), "reason": "error_interno"}


# ---------------------------------------------------------------------------
# Servicio HTTP mínimo para desplegar el scraper junto al backend Python
# ---------------------------------------------------------------------------
def _crear_manejador(token: str):
    class Manejador(BaseHTTPRequestHandler):
        server_version = "ServiciosCDMX/1.0"

        def _json(self, codigo: int, cuerpo: Dict[str, Any]) -> None:
            datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
            self.send_response(codigo)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(datos)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(datos)

        def do_GET(self) -> None:  # noqa: N802
            if self.path == "/health":
                self._json(200, {"ok": True})
            else:
                self._json(404, {"status": "ERROR", "reason": "no_encontrado"})

        def do_POST(self) -> None:  # noqa: N802
            if self.path != "/consulta":
                return self._json(404, {"status": "ERROR", "reason": "no_encontrado"})
            enviado = self.headers.get("Authorization", "")
            if not hmac.compare_digest(enviado, f"Bearer {token}"):
                return self._json(401, {"status": "ERROR", "reason": "no_autorizado"})
            try:
                largo = int(self.headers.get("Content-Length", "0"))
                if not 0 < largo <= 2048:
                    raise ValueError
                cuerpo = json.loads(self.rfile.read(largo))
                if not isinstance(cuerpo, dict):
                    raise ValueError
            except ValueError:
                return self._json(400, {"status": "ERROR", "reason": "solicitud_invalida"})
            resultado = consultar_placa(
                cuerpo.get("tipo", ""),
                cuerpo.get("placa", ""),
                cuerpo.get("idempotency_key") or None,
            )
            self._json(200, resultado)

        def log_message(self, formato: str, *args: Any) -> None:
            # Sin placas ni cabeceras en los logs.
            sys.stderr.write("%s %s\n" % (self.command, self.path))

    return Manejador


def servir(puerto: int) -> None:
    token = os.environ.get("CDMX_SCRAPER_TOKEN", "")
    if len(token) < 24:
        sys.exit("CDMX_SCRAPER_TOKEN es obligatorio (mínimo 24 caracteres).")
    ThreadingHTTPServer(("0.0.0.0", puerto), _crear_manejador(token)).serve_forever()


def main(argv: Sequence[str]) -> int:
    if len(argv) >= 2 and argv[1] == "serve":
        servir(int(os.environ.get("PORT", "8080")))
        return 0
    if len(argv) == 3 and argv[1] in SCRAPERS:
        print(json.dumps(consultar_placa(argv[1], argv[2]), ensure_ascii=False, indent=2))
        return 0
    sys.stderr.write("Uso: servicios_cdmx.py (tenencia|verificacion) PLACA | serve\n")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
