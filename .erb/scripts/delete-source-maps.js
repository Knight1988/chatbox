import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { rimrafSync } from 'rimraf'

// Use paths relative to repo root — avoids dependency on legacy webpack.paths
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootPath = path.resolve(__dirname, '../..')
const distMainPath = path.join(rootPath, 'release/app/dist/main')
const distRendererPath = path.join(rootPath, 'release/app/dist/renderer')

export default function deleteSourceMaps() {
    if (fs.existsSync(distMainPath))
        rimrafSync(path.join(distMainPath, '**', '*.js.map'), {
            glob: true,
        })
    if (fs.existsSync(distRendererPath))
        rimrafSync(path.join(distRendererPath, '**', '*.js.map'), {
            glob: true,
        })
}
