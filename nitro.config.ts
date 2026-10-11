import { defineNitroConfig } from "nitro/config";
export default defineNitroConfig({
  // Explicitly suppress Nitro's automatic original public/ directory scan.
  publicAssets: [
    { dir: "public", ignore: ["**/*"] },
    { dir: "tmp/hosting/public", baseURL: "/" },
  ],
});
