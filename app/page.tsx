"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImageGeneratorForm } from "@/components/image-generator-form";
import { ImageEditorForm } from "@/components/image-editor-form";
// ImageDisplay组件已删除
import { ImagesWithHistory } from "@/components/images-with-history";

export default function Home() {
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("generate");
  const [isVercelEnv, setIsVercelEnv] = useState(false);
  const [originalImageId, setOriginalImageId] = useState<string | null>(null);
  const [rootParentId, setRootParentId] = useState<string | null>(null);

  // 检测是否在Vercel环境中
  useEffect(() => {
    // 检查是否在客户端
    if (typeof window !== 'undefined') {
      // 检查是否在Vercel环境中
      const isVercel = window.location.hostname.includes('vercel.app');
      setIsVercelEnv(isVercel);
    }
  }, []);

  const handleImageGenerated = (imageUrl: string, imageId?: string) => {
    setCurrentImageUrl(imageUrl);
    // 如果提供了图片ID，保存为原始图片ID
    if (imageId) {
      setOriginalImageId(imageId);
      setRootParentId(imageId); // 对于新生成的图片，rootParentId与originalImageId相同
    } else {
      setOriginalImageId(null);
      setRootParentId(null);
    }
    // Automatically switch to edit tab after generating an image
    setActiveTab("edit");
  };

  const handleImageEdited = (imageUrl: string, imageId?: string, parentId?: string, rootId?: string) => {
    setCurrentImageUrl(imageUrl);
    // 如果提供了图片ID信息，更新状态
    if (imageId) {
      setOriginalImageId(imageId);
    }
    if (rootId) {
      setRootParentId(rootId);
    } else if (parentId) {
      // 如果没有提供rootId但有parentId，使用parentId作为rootParentId
      setRootParentId(parentId);
    }
  };

  return (
    <main className="container mx-auto py-8 px-4 md:px-6">
      <div className="flex flex-col items-center justify-center mb-8">
        <h1 className="text-4xl font-bold tracking-tight">HD生图P图神器</h1>
        <p className="text-xl text-muted-foreground mt-2">
          使用谷歌Gemini 2.0 Flash模型生成和编辑高清图像
        </p>
      </div>

      <div className="w-full max-w-3xl mx-auto mb-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="generate">生成图像</TabsTrigger>
            <TabsTrigger value="edit">编辑图像</TabsTrigger>
          </TabsList>
          <TabsContent value="generate">
            <ImageGeneratorForm 
              onImageGenerated={handleImageGenerated} 
            />
          </TabsContent>
          <TabsContent value="edit">
            <ImageEditorForm 
              onImageEdited={handleImageEdited} 
              initialImageUrl={currentImageUrl || ""}
              readOnlyUrl={!!currentImageUrl}
              originalImageId={originalImageId || undefined}
              rootParentId={rootParentId || undefined}
            />
          </TabsContent>
        </Tabs>
      </div>


      
      {/* 图片编辑历史 */}
      <div className="mb-8">
        <ImagesWithHistory />
      </div>

      <footer className="text-center text-sm text-muted-foreground py-4 border-t">
        <p>
          由谷歌 Gemini 2.0 Flash 模型驱动。使用 Next.js 构建。
        </p>
      </footer>
    </main>
  );
}