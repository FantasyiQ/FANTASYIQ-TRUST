import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name:             'FantasyiQ Trust',
        short_name:       'FiQ',
        description:      'The fantasy football platform that never touches your money. Zero fees. Zero skimming. Total trust.',
        start_url:        '/dashboard',
        display:          'standalone',
        background_color: '#030712',
        theme_color:      '#030712',
        icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
    };
}
