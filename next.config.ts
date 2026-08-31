import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // jsdom (used for article-content scraping — see src/lib/articles/extract.ts)
  // pulls in a transitive dependency chain (html-encoding-sniffer ->
  // @exodus/bytes) that mixes CommonJS require() with an ES Module in a way
  // Next's bundler can't resolve for a serverless function — bundling it
  // crashes at runtime with ERR_REQUIRE_ESM before the route ever executes,
  // surfacing as an empty-body 500 (seen in ingest-feeds and the article
  // content/summarize routes). Excluding it from bundling loads it natively
  // from node_modules at runtime instead, which sidesteps the bundler
  // entirely — the standard fix for this class of error with jsdom on
  // serverless platforms.
  serverExternalPackages: ['jsdom'],
};

export default nextConfig;
