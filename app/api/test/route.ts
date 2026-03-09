import { pusherServer } from '@/lib/pusher';
import { NextResponse } from 'next/server';

export async function GET() {
  await pusherServer.trigger('stream-channel', 'test-event', {
    message: '¡Handshake Exitoso, Vaquero! 🌵',
  });

  return NextResponse.json({ status: 'Evento disparado' });
}