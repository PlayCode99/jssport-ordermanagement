import { useCallback, useState } from 'react';

type UseWebpCompressResult = {
    compressImage: (file: File) => Promise<File>;
    isCompressing: boolean;
    error: string | null;
};

const MAX_SIDE = 1920;
const WEBP_QUALITY = 0.78;

function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();

        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };

        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Unable to load image for compression.'));
        };

        image.src = objectUrl;
    });
}

function toWebpBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    reject(
                        new Error(
                            'Canvas could not produce a compressed blob.',
                        ),
                    );

                    return;
                }

                resolve(blob);
            },
            'image/webp',
            WEBP_QUALITY,
        );
    });
}

function toWebpFileName(fileName: string): string {
    const baseName = fileName.replace(/\.[^/.]+$/, '');

    return `${baseName}.webp`;
}

export function useWebpCompress(): UseWebpCompressResult {
    const [isCompressing, setIsCompressing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const compressImage = useCallback(async (file: File): Promise<File> => {
        if (!file.type.startsWith('image/')) {
            return file;
        }

        setIsCompressing(true);
        setError(null);

        try {
            const image = await loadImage(file);
            const scale = Math.min(
                1,
                MAX_SIDE / image.width,
                MAX_SIDE / image.height,
            );
            const targetWidth = Math.max(1, Math.round(image.width * scale));
            const targetHeight = Math.max(1, Math.round(image.height * scale));

            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;

            const context = canvas.getContext('2d');

            if (!context) {
                throw new Error(
                    '2D canvas context is unavailable in this browser.',
                );
            }

            context.drawImage(image, 0, 0, targetWidth, targetHeight);

            const webpBlob = await toWebpBlob(canvas);

            return new File([webpBlob], toWebpFileName(file.name), {
                type: 'image/webp',
                lastModified: Date.now(),
            });
        } catch (compressError) {
            const message =
                compressError instanceof Error
                    ? compressError.message
                    : 'Image compression failed.';
            setError(message);

            return file;
        } finally {
            setIsCompressing(false);
        }
    }, []);

    return {
        compressImage,
        isCompressing,
        error,
    };
}
