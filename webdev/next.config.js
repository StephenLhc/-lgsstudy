/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
}

module.exports = nextConfig

import { withContentlayer } from "next-contentlayer";

/** @type {import('next').NextConfig} */
export default withContentlayer({
  reactStrictMode: true,
});
