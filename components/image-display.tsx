"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";

interface ImageDisplayProps {
  imageUrl: string | null;
}

export function ImageDisplay({ imageUrl }: ImageDisplayProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  useEffect(() => {
    if (imageUrl) {
      setIsLoading(true);
      
      // 检查是否是飞书URL
      const isFeishuUrl = imageUrl.includes('open.feishu.cn');
      
      // 检查是否是本地URL
      const isLocalUrl = imageUrl.startsWith('/');
      
      // 检查是否在Vercel环境中
      const isVercelEnv = typeof window !== 'undefined' && 
        window.location.hostname.includes('vercel.app');
      
      // 在Vercel环境中，如果是本地URL且不是API代理URL，可能需要使用代理
      if (isVercelEnv && isLocalUrl && !imageUrl.startsWith('/api/')) {
        console.log('在Vercel环境中检测到本地URL，这可能无法正常工作:', imageUrl);
      }
      
      // 如果是飞书URL，使用代理
      if (isFeishuUrl) {
        setImgSrc(`/api/image-proxy?url=${encodeURIComponent(imageUrl)}`);
      } else {
        setImgSrc(imageUrl);
      }
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
          {imgSrc && (
            <img
              src={imgSrc}
              alt="Generated image"
              className="absolute inset-0 w-full h-full object-contain"
              onLoad={() => setIsLoading(false)}
              onError={(e) => {
                console.error('图片加载失败:', imgSrc);
                
                // 如果当前URL不是代理URL，且是本地URL，尝试使用飞书URL
                if (!imgSrc.startsWith('/api/') && imageUrl && imageUrl.startsWith('/')) {
                  // 尝试从元数据中获取飞书URL
                  fetch(`/api/image-metadata?path=${encodeURIComponent(imageUrl)}`)
                    .then(res => res.json())
                    .then(data => {
                      if (data.success && data.data?.feishuUrl) {
                        console.log('尝试使用飞书URL:', data.data.feishuUrl);
                        setImgSrc(`/api/image-proxy?url=${encodeURIComponent(data.data.feishuUrl)}`);
                        return;
                      }
                      // 如果无法获取飞书URL，使用占位图
                      e.currentTarget.src = '/placeholder-image.svg';
                      setIsLoading(false);
                    })
                    .catch(err => {
                      console.error('获取元数据失败:', err);
                      e.currentTarget.src = '/placeholder-image.svg';
                      setIsLoading(false);
                    });
                } else {
                  e.currentTarget.src = '/placeholder-image.svg';
                  setIsLoading(false);
                }
              }}
            />
          )}
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