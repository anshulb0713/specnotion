import dotenv from "dotenv";
import type { NextConfig } from "next";

dotenv.config({ path: new URL("../../.env", import.meta.url) });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
};

export default nextConfig;
