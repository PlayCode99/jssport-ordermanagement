import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: './resources/js/test/setup.ts',
        // Several suites render the whole order form, which is a large tree of
        // Radix selects. Under parallel load a single render plus its follow-up
        // interactions can pass 5s, which made the run fail roughly one time in
        // six with a timeout rather than a real assertion.
        testTimeout: 15000,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './resources/js'),
        },
    },
});
