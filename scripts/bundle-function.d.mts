/** Types for the bundler, so the test that checks its output can be checked too. */
export declare const BUNDLE_PATH: string
export declare function buildBundle(): Promise<string>
export declare function readBundle(): Promise<string>
