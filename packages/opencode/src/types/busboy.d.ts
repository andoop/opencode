declare module "busboy" {
  type BusboyFile = NodeJS.ReadableStream & {
    truncated?: boolean
  }

  type BusboyFileInfo = {
    filename?: string
    mimeType?: string
  }

  type BusboyInstance = NodeJS.WritableStream & {
    on(event: "filesLimit", listener: () => void): BusboyInstance
    on(event: "file", listener: (name: string, file: BusboyFile, info: BusboyFileInfo) => void): BusboyInstance
  }

  type BusboyOptions = {
    headers: Record<string, string>
    limits?: {
      files?: number
      fileSize?: number
    }
  }

  export default function Busboy(options: BusboyOptions): BusboyInstance
}
