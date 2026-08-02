// Vite asset-url imports (e.g. the pdf.js worker: `...?url`)
declare module '*?url' {
  const url: string;
  export default url;
}

// Browser build of mammoth (.docx -> text), loaded via dynamic import.
declare module 'mammoth/mammoth.browser' {
  const mammoth: {
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
    convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
  };
  export default mammoth;
}
