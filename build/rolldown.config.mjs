import { defineConfig } from 'rolldown'
import typescript from '@rollup/plugin-typescript';

export default defineConfig([
    {
        input: 'src/mod.ts',
        output: {
            file: 'dist/index.js',
            format: 'esm',
        },
        plugins: [typescript({
            compilerOptions: {
                declaration: true,
                declarationDir: 'dist/declarations',
            }
        })],
    },

    // NOT WORKING WITH ROLLDOWN AS OF 2025-02-26, THEREFORE USE ROLLUP INSTEAD
    // {
    //     input: 'dist/mod.d.ts',
    //     output: {
    //         file: 'dist/index.d.ts',
    //         format: 'esm',
    //     },
    //     plugins: [dts()],
    // },
])