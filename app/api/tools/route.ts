import { NextResponse } from 'next/server';
import { executeAssistantTool } from '@/lib/server/assistantTools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name : '';
    const args = body.args && typeof body.args === 'object' ? body.args : {};
    const images = Array.isArray(body.images) ? body.images.filter((x: unknown) => typeof x === 'string') : [];
    if (!name) return NextResponse.json({ ok: false, error: 'Falta el nombre de la herramienta.' }, { status: 400 });
    const result = await executeAssistantTool(name, args, images);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('Tool error:', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'No se pudo ejecutar la herramienta.' }, { status: 400 });
  }
}
