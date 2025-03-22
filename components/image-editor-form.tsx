"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import { Upload, ImageIcon } from "lucide-react";

interface ImageEditorFormProps {
  onImageEdited?: (imageUrl: string) => void;
  initialImageUrl?: string;
  readOnlyUrl?: boolean;
}

export function ImageEditorForm({ 
  onImageEdited, 
  initialImageUrl = "", 
  readOnlyUrl = false 
}: ImageEditorFormProps) {
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update imageUrl when initialImageUrl changes
  useEffect(() => {
    if (initialImageUrl) {
      setImageUrl(initialImageUrl);
      setPreviewUrl(initialImageUrl);
    }
  }, [initialImageUrl]);

  // 清理预览URL
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // 处理文件选择
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        setSelectedFile(file);
        // 创建预览
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        setImageUrl(''); // 清空URL输入，因为用户选择了上传的文件
        setError(null);
      } else {
        setError('请选择有效的图片文件（JPEG、PNG等）');
        setSelectedFile(null);
      }
    }
  };

  // 触发文件选择
  const handleSelectFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!prompt.trim()) {
      setError("请输入编辑指令");
      return;
    }

    // 检查是否有图像来源（URL或上传的文件）
    if (!imageUrl && !selectedFile) {
      setError("请上传图片或输入图像网址");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let response;
      
      if (selectedFile) {
        // 如果有上传的文件，先上传图片
        const formData = new FormData();
        formData.append('image', selectedFile);
        formData.append('prompt', "用户上传的原始图片"); // 添加固定提示词
        
        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });
        
        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json();
          throw new Error(errorData.error?.message || "上传图片失败");
        }
        
        const uploadData = await uploadResponse.json();
        const uploadedImageUrl = uploadData.data?.imageUrl;
        
        if (!uploadedImageUrl) {
          throw new Error("上传图片后未返回有效的URL");
        }
        
        // 使用上传后的图片URL进行编辑
        response = await fetch("/api/edit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ prompt, imageUrl: uploadedImageUrl }),
        });
      } else {
        // 使用输入的URL进行编辑
        response = await fetch("/api/edit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ prompt, imageUrl }),
        });
      }

      const data = await response.json();

      if (!response.ok) {
        // 检查是否是速率限制错误
        if (response.status === 429 || (data.error?.code === "RATE_LIMIT_EXCEEDED")) {
          throw new Error("超出 API 速率限制，请等待几分钟后再试。");
        } else {
          throw new Error(data.error?.message || "编辑图像失败");
        }
      }

      if (onImageEdited && data.data?.imageUrl) {
        onImageEdited(data.data.imageUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "发生错误");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>编辑图像</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent>
          <div className="grid w-full gap-4">
            <div className="flex flex-col space-y-2">
              {readOnlyUrl ? (
                <>
                  <Label>使用图像</Label>
                  <div className="relative aspect-video w-full overflow-hidden rounded-md border">
                    {previewUrl && (
                      <img
                        src={previewUrl.startsWith('https://open.feishu.cn') 
                          ? `/api/image-proxy?url=${encodeURIComponent(previewUrl)}` 
                          : previewUrl}
                        alt="要编辑的图像" 
                        className="absolute inset-0 w-full h-full object-contain"
                        onError={(e) => {
                          console.error('图片加载失败:', previewUrl);
                          e.currentTarget.src = '/placeholder-image.svg';
                        }}
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    正在使用您刚才生成的图像进行编辑。
                  </p>
                </>
              ) : (
                <>
                  <Label>选择图像</Label>
                  <div className="grid gap-2">
                    {/* 图片预览区域 */}
                    <div 
                      className="relative aspect-video w-full overflow-hidden rounded-md border border-dashed flex items-center justify-center"
                      onClick={handleSelectFileClick}
                    >
                      {previewUrl ? (
                        <img
                          src={previewUrl.startsWith('https://open.feishu.cn') 
                            ? `/api/image-proxy?url=${encodeURIComponent(previewUrl)}` 
                            : previewUrl}
                          alt="要编辑的图像" 
                          className="absolute inset-0 w-full h-full object-contain"
                          onError={(e) => {
                            console.error('图片加载失败:', previewUrl);
                            e.currentTarget.src = '/placeholder-image.svg';
                          }}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-muted-foreground p-4">
                          <ImageIcon className="h-10 w-10 mb-2" />
                          <p>点击选择图像或拖放图片到此处</p>
                        </div>
                      )}
                    </div>
                    
                    {/* 上传按钮 */}
                    <div className="flex items-center gap-2">
                      <Button 
                        type="button" 
                        variant="secondary" 
                        onClick={handleSelectFileClick}
                        disabled={isLoading}
                        className="w-full"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        选择图片
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </div>
                    
                    {/* 可选的URL输入 */}
                    <div className="flex flex-col mt-2">
                      <p className="text-sm text-muted-foreground mb-1">或输入图像URL:</p>
                      <Input
                        id="imageUrl"
                        placeholder="输入要编辑的图像网址"
                        value={imageUrl}
                        onChange={(e) => {
                          setImageUrl(e.target.value);
                          if (e.target.value) {
                            setPreviewUrl(e.target.value);
                            setSelectedFile(null);
                          }
                        }}
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-col space-y-2">
              <Label htmlFor="editPrompt">编辑指令</Label>
              <Textarea
                id="editPrompt"
                placeholder="请描述您想如何编辑这张图像..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[120px]"
                disabled={isLoading}
                autoFocus={readOnlyUrl}
              />
              {error && (
                <div className="text-sm text-red-500 rounded p-2 bg-red-50 border border-red-200">
                  <p className="font-semibold">错误：</p>
                  <p>{error}</p>
                  {error.includes('速率限制') && (
                    <p className="mt-2">提示：如果您频繁遇到速率限制，可以尝试等待几分钟后再尝试，或减少请求频率。</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? "编辑中..." : "编辑图像"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}