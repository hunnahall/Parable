import { listFeedsDetailed, type FeedRow } from './data'
import { listFolders, type FolderRow } from '@/lib/folders/data'

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function feedOutline(feed: FeedRow, indent: string): string {
  const title = escapeXmlAttr(feed.title || feed.url)
  const url = escapeXmlAttr(feed.url)
  return `${indent}<outline type="rss" text="${title}" title="${title}" xmlUrl="${url}"/>`
}

// Mirrors OpmlImport.tsx's parser: folders are plain <outline text="..."> groups
// with no xmlUrl, nested arbitrarily deep; feeds are leaf <outline type="rss">
// entries with xmlUrl. A feed in multiple folders (this app's model allows
// many-to-many, unlike OPML's tree) is duplicated under each folder's
// outline — lossless on export, and every reader's importer just sees the
// same feed listed more than once, which is the standard way OPML handles
// this rather than picking one folder and dropping the rest.
function buildOutlineTree(
  parentId: string | null,
  folders: FolderRow[],
  feedsByFolder: Map<string, FeedRow[]>,
  depth: number
): string {
  const indent = '  '.repeat(depth)
  const children = folders
    .filter((f) => f.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name))

  return children
    .map((folder) => {
      const name = escapeXmlAttr(folder.name)
      const feeds = feedsByFolder.get(folder.id) ?? []
      const feedLines = feeds.map((feed) => feedOutline(feed, '  '.repeat(depth + 1)))
      const subfolders = buildOutlineTree(folder.id, folders, feedsByFolder, depth + 1)
      const body = [...feedLines, subfolders].filter(Boolean).join('\n')
      return body
        ? `${indent}<outline text="${name}" title="${name}">\n${body}\n${indent}</outline>`
        : `${indent}<outline text="${name}" title="${name}"/>`
    })
    .join('\n')
}

export async function generateFeedsOpml(): Promise<string> {
  const [feeds, folders] = await Promise.all([listFeedsDetailed(), listFolders()])

  const feedsByFolder = new Map<string, FeedRow[]>()
  const unfiled: FeedRow[] = []
  for (const feed of feeds) {
    if (feed.folderIds.length === 0) {
      unfiled.push(feed)
      continue
    }
    for (const folderId of feed.folderIds) {
      const list = feedsByFolder.get(folderId) ?? []
      list.push(feed)
      feedsByFolder.set(folderId, list)
    }
  }

  const folderTree = buildOutlineTree(null, folders, feedsByFolder, 1)
  const unfiledLines = unfiled.map((feed) => feedOutline(feed, '  '))
  const body = [...unfiledLines, folderTree].filter(Boolean).join('\n')

  const createdAt = new Date().toUTCString()
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Parable feeds</title>
    <dateCreated>${createdAt}</dateCreated>
  </head>
  <body>
${body}
  </body>
</opml>
`
}
