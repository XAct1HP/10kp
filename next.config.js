/** @type {import('next').NextConfig} */
const nextConfig = {
  // @xenova/transformers pulls in onnxruntime-node, which loads a native .node
  // binary. Tell Next to require() these packages at runtime instead of trying
  // to bundle them through webpack.
  experimental: {
    serverComponentsExternalPackages: [
      "@xenova/transformers",
      "onnxruntime-node",
      "sharp",
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Belt-and-braces: mark the native binding as external so it's never
      // walked into the bundle graph, even if a transitive dep imports it.
      config.externals = config.externals || [];
      config.externals.push({
        "onnxruntime-node": "commonjs onnxruntime-node",
      });
    }
    return config;
  },
};

module.exports = nextConfig;
