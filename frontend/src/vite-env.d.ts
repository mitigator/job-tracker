/// <reference types="vite/client" />

// Typed access to our variables from frontend/.env
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
