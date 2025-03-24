"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChatInterface } from "@/components/chat-interface";
import { ImagesWithHistory } from "@/components/images-with-history";

export default function Home() {
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);

  const [isVercelEnv, setIsVercelEnv] = useState(false);
  // 改名为currentImageId，更准确地反映其用途：当前选中的图片ID，而不是原始图片ID
  const [currentImageId, setCurrentImageId] = useState<string | null>(null);
  const [rootParentId, setRootParentId] = useState<string | null>(null);
  
  // 添加日志输出，便于调试
  useEffect(() => {
    console.log(`当前选中的图片ID更新为: ${currentImageId}`);
    console.log(`根父级ID更新为: ${rootParentId}`);
  }, [currentImageId, rootParentId]);
  
  // 添加聊天界面相关的日志
  useEffect(() => {
    console.log(`当前图片URL更新为: ${currentImageUrl || '无'}`);
  }, [currentImageUrl]);

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
    // 如果提供了图片ID，保存为当前选中的图片ID
    if (imageId) {
      console.log(`生成新图片，设置当前图片ID为: ${imageId}`);
      setCurrentImageId(imageId);
      setRootParentId(imageId); // 对于新生成的图片，rootParentId与当前图片ID相同
    } else {
      setCurrentImageId(null);
      setRootParentId(null);
    }

  };

  const handleImageEdited = (imageUrl: string, imageId?: string, parentId?: string, rootId?: string) => {
    setCurrentImageUrl(imageUrl);
    
    // 添加详细的日志输出，便于调试
    console.log(`图片编辑完成，接收到的参数:`);
    console.log(`  新图片URL: ${imageUrl}`);
    console.log(`  新图片ID: ${imageId || '无'}`);
    console.log(`  父图片ID: ${parentId || '无'}`);
    console.log(`  根父级ID: ${rootId || '无'}`);
    
    // 如果提供了图片ID信息，更新状态
    if (imageId) {
      console.log(`编辑完成，更新当前图片ID为: ${imageId}`);
      setCurrentImageId(imageId); // 更新当前选中的图片ID
    }
    
    // 处理rootParentId
    if (rootId) {
      console.log(`使用提供的rootId: ${rootId}`);
      setRootParentId(rootId);
    } else if (parentId) {
      // 如果没有提供rootId但有parentId，检查是否需要更新rootParentId
      console.log(`没有rootId，检查是否使用parentId: ${parentId}`);
      
      // 如果当前没有rootParentId，才使用parentId
      if (!rootParentId) {
        console.log(`当前没有rootParentId，使用parentId作为rootParentId: ${parentId}`);
        setRootParentId(parentId);
      } else {
        console.log(`保持现有的rootParentId: ${rootParentId}`);
      }
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
        <ChatInterface 
          onImageGenerated={handleImageGenerated}
          onImageEdited={handleImageEdited}
        />
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