"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";

interface ImageDisplayProps {
  imageUrl: string | null;
}

export function ImageDisplay({ imageUrl }: ImageDisplayProps) {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (imageUrl) {
      setIsLoading(true);
    }
  }, [imageUrl]);

  if (!imageUrl) {
    return (
      <Card className="w-full h-[400px] flex items-center justify-center bg-muted">
        <p className="text-muted-foreground">No image generated yet</p>
      </Card>
    );
  }

  return (
    <Card className="w-full overflow-hidden">
      <CardContent className="p-0">
        <div className="relative w-full h-[400px]">
          {/* 使用原生img标签显示所有图片 */}
          <img
            src={imageUrl.startsWith('https://open.feishu.cn') 
              ? `/api/image-proxy?url=${encodeURIComponent(imageUrl)}` 
              : imageUrl}
            alt="Generated image"
            className="absolute inset-0 w-full h-full object-contain"
            onLoad={() => setIsLoading(false)}
            onError={(e) => {
              console.error('图片加载失败:', imageUrl);
              e.currentTarget.src = '/placeholder-image.svg';
              setIsLoading(false);
            }}
          />
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <p>Loading image...</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}