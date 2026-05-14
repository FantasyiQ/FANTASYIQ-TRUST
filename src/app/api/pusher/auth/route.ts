import { auth } from '@/lib/auth';
import { getPusherServer, userChannel } from '@/lib/pusher';

export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });

    const pusher = getPusherServer();
    if (!pusher) return new Response('Pusher not configured', { status: 503 });

    const body = await req.text();
    const params = new URLSearchParams(body);
    const socketId      = params.get('socket_id')       ?? '';
    const channelName   = params.get('channel_name')    ?? '';

    // Only allow the user to subscribe to their own channel
    const allowedChannel = userChannel(session.user.id);
    if (channelName !== allowedChannel) {
        return new Response('Forbidden', { status: 403 });
    }

    const authResponse = pusher.authorizeChannel(socketId, channelName);
    return Response.json(authResponse);
}
