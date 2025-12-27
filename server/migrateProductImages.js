import cloudinary from "./cloudinary.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const productImages = [
  { name: "Vetadew_serum.jpg", folder: "portfolio/products" },
  { name: "Vetadew_fw.jpg", folder: "portfolio/products" },
  { name: "Follideep_shampoo.jpg", folder: "portfolio/products" },
  { name: "Follideep.jpg", folder: "portfolio/products" },
  { name: "Vetadew_Moist_cream.jpg", folder: "portfolio/products" },
  { name: "Vetadew_lotion.jpg", folder: "portfolio/products" },
  { name: "Vetadew_glow_cream.jpg", folder: "portfolio/products" },
  { name: "Sebotri.jpg", folder: "portfolio/products" },
  { name: "yugen.jpg", folder: "portfolio/products" },
  { name: "Luligma.jpg", folder: "portfolio/products" },
  { name: "eberstat.jpg", folder: "portfolio/products" },
  { name: "itra_nxt.jpg", folder: "portfolio/products" },
  { name: "ketobenz.jpg", folder: "portfolio/products" },
  { name: "mofort-f.jpg", folder: "portfolio/products" },
  { name: "mofort.jpg", folder: "portfolio/products" },
  { name: "vetadew_soap.jpg", folder: "portfolio/products" },
  { name: "clp_fort.jpg", folder: "portfolio/products" },
];

async function migrateImages() {
  const results = {};

  for (const image of productImages) {
    try {
      const imagePath = path.join(
        __dirname,
        "../../frontend/src/assets/products",
        image.name
      );

      if (!fs.existsSync(imagePath)) {
        console.log(`❌ File not found: ${image.name}`);
        continue;
      }

      const result = await cloudinary.v2.uploader.upload(imagePath, {
        folder: image.folder,
        public_id: image.name.replace(".jpg", ""),
        transformation: [
          { width: 600, height: 600, crop: "limit" },
          { quality: "auto:good" },
          { fetch_format: "auto" },
        ],
      });

      results[image.name] = result.secure_url;
      console.log(`✅ Uploaded: ${image.name} -> ${result.secure_url}`);
    } catch (error) {
      console.error(`❌ Error uploading ${image.name}:`, error.message);
    }
  }

  console.log("\n📋 CLOUDINARY URLs:");
  console.log(JSON.stringify(results, null, 2));

  // Save to file for reference
  fs.writeFileSync(
    path.join(__dirname, "cloudinary-urls.json"),
    JSON.stringify(results, null, 2)
  );
  console.log("\n💾 URLs saved to cloudinary-urls.json");
}

migrateImages().catch(console.error);
