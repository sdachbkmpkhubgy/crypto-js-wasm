import { generateWasmBytes } from '../../utils/wasm-utils';

export const wasmBytes = generateWasmBytes('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');
