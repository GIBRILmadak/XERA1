-- Le bucket public "media" acceptait n'importe quel type de fichier, sans
-- limite de taille. Seul js/file-upload.js y écrit, et uniquement des images
-- et des vidéos (+ les miniatures vidéo en WebP/JPEG).
update storage.buckets
set
    file_size_limit = 52428800, -- 50 Mo, la limite du plan gratuit
    allowed_mime_types = array[
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/heic',
        'image/heif',
        'image/avif',
        'video/mp4',
        'video/x-m4v',
        'video/quicktime',
        'video/webm',
        'video/x-matroska',
        'video/3gpp',
        'video/3gpp2',
        'video/ogg'
    ]
where id = 'media';
