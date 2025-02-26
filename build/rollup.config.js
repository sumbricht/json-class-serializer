import dts from "rollup-plugin-dts";
const config = [
  {
    input: 'dist/declarations/mod.d.ts',
    output: {
      file: 'dist/index.d.ts',
      format: 'esm'
    },
    plugins: [dts()]
  }
];
export default config;