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
        // Radix selects, and a few of them render it twenty times over. That
        // work is real and single-threaded, so running one such file per core
        // left every one of them starved: measured on an 8-core machine, the
        // slowest test took 3.5s on its own and 12.9s to 26.8s in a full run —
        // four to eight times slower — and the run failed on a timeout rather
        // than a real assertion in three of seven attempts.
        //
        // Raising the timeout only moves that number; it was already raised
        // from 5s to 15s once and went bad again. Giving each worker enough
        // CPU is what actually fixes it. Measured over the whole suite:
        //
        //   workers   slowest test   of the 15s budget   whole run
        //   default        12,894ms             86%        130.2s
        //   5               7,032ms             47%        114.2s
        //   4               7,250ms             48%        121.1s
        //   3               5,040ms             34%        136.6s
        //
        // Fewer workers is both steadier AND no slower, because the machine
        // stops thrashing. Written as a share of the cores rather than a
        // count, so it holds on a machine of another size.
        maxWorkers: '50%',
        // With the workers above, the slowest test uses about half of this,
        // so an ordinary slow run no longer reads as a failure. It stays long
        // enough to cover a genuinely heavy render, and short enough that a
        // test which truly hangs still says so.
        testTimeout: 15000,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './resources/js'),
        },
    },
});
