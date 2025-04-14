import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "react-three-gltf-viewer",
  description: "react-three-gltf-viewer 3D model viewer gltf viewer 3d model viewer",
  keywords: "react-three-gltf-viewer 3D model viewer gltf viewer 3d model viewer",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
