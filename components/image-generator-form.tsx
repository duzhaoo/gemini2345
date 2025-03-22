"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface ImageGeneratorFormProps {
  onImageGenerated?: (imageUrl: string) => void;
}

export function ImageGeneratorForm({ onImageGenerated }: ImageGeneratorFormProps) {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!prompt.trim()) {
      setError("请输入描述内容");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();

      if (!response.ok) {
        // 检查是否是速率限制错误
        if (response.status === 429 || (data.error?.code === "RATE_LIMIT_EXCEEDED")) {
          throw new Error("超出 API 速率限制，请等待几分钟后再试。您也可以使用上传图片功能。");
        } else {
          throw new Error(data.error?.message || "生成图像失败");
        }
      }

      if (onImageGenerated && data.data?.imageUrl) {
        onImageGenerated(data.data.imageUrl);
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
        <CardTitle>生成图像</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent>
          <div className="grid w-full gap-4">
            <div className="flex flex-col space-y-2">
              <Label htmlFor="prompt">图像描述</Label>
              <Textarea
                id="prompt"
                placeholder="请描述您想要生成的图像..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[120px]"
                disabled={isLoading}
              />
              {error && (
                <div className="text-sm text-red-500 rounded p-2 bg-red-50 border border-red-200">
                  <p className="font-semibold">错误：</p>
                  <p>{error}</p>
                  {error.includes('速率限制') && (
                    <p className="mt-2">提示：如果您频繁遇到速率限制，可以考虑使用图片编辑功能。</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? "生成中..." : "生成图像"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}