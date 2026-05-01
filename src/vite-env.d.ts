/// <reference types="vite/client" />

declare module '*.md?url' {
  const url: string;
  export default url;
}
