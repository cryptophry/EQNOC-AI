// Vite asset-url imports (e.g. the pdf.js worker: `...?url`)
declare module '*?url' {
  const url: string;
  export default url;
}
