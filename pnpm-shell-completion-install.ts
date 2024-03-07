#!/usr/bin/env bun

import { createWriteStream, promises as fsPromises } from 'fs'
import { exec } from 'child_process'
import os from 'os'
import { pipeline } from 'stream'
import { promisify } from 'util'
import * as tar from 'tar'
import * as AdmZip from 'adm-zip'
import fs from 'fs'

const streamPipeline = promisify(pipeline)
const user = 'g-plane'
const repo = 'pnpm-shell-completion'
const getDownloadURL = () => {
  const platform = os.platform()
  const arch = os.arch()

  let binaryName

  if (platform === 'darwin') {
    binaryName =
      arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin'
  } else if (platform === 'linux') {
    binaryName = 'x86_64-unknown-linux-gnu' // or 'x86_64-unknown-linux-musl' based on your libc
  } else {
    throw new Error(`Unsupported platform: ${platform}`)
  }

  // Assuming a generic URL structure for demonstration
  return `https://github.com/${user}/${repo}/releases/latest/download/pnpm-shell-completion_${binaryName}.tar.gz`
}

const downloadAndExtract = async (url: string, outputPath: string) => {
  console.log(`Downloading from ${url}`)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`)
  }

  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true })
  }
  if (url.endsWith('.zip')) {
    // @ts-expect-error
    const buffer = await response.buffer()
    const zip = new AdmZip(buffer)
    zip.extractAllTo(outputPath, true)
  } else if (url.endsWith('.tar.gz')) {
    // @ts-expect-error
    await streamPipeline(response.body, tar.x({ C: outputPath }))
  }
}

const runInstallScript = async () => {
  const pluginPath = process.env.ZSH_CUSTOM
    ? process.env.ZSH_CUSTOM + '/plugins'
    : `${os.homedir()}/.oh-my-zsh/plugins`

  // change dir to tempDir
  process.chdir('./tempDir')
  return promisify(exec)(`./install.zsh ${pluginPath}`)
}

const modifyZshrc = async () => {
  const zshrcPath = os.homedir() + '/.zshrc'

  const zshrcContent = await fsPromises.readFile(zshrcPath, 'utf8')
  const pluginsMatch = zshrcContent.match(/^(plugins=\([^)]*\))/m)
  const plugins = pluginsMatch?.[1]
  if (!plugins) {
    throw new Error('No plugins found in .zshrc')
  }
  if (plugins?.includes('pnpm-shell-completion')) {
    console.log('pnpm-shell-completion already exists in plugins')
    return
  } else {
    const updatedContent = zshrcContent.replace(
      plugins,
      `${plugins.substring(0, plugins.length - 1)} pnpm-shell-completion)`
    )
    await fsPromises.writeFile(zshrcPath, updatedContent)
    console.log('added pnpm-shell-completion to plugins')
  }
}

;(async () => {
  try {
    const url = getDownloadURL()
    await downloadAndExtract(url, './tempDir')
    await runInstallScript()
    await modifyZshrc()
    await fsPromises.rmdir('../tempDir', { recursive: true })
    console.log('Installation and configuration complete!')
  } catch (error) {
    console.error(`An error occurred: ${error.message}`)
  }
})()
