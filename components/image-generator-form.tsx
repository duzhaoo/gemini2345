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
    <Card className="w-full shadow-md border-0">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-lg pb-2">
        <CardTitle className="text-xl font-bold text-gray-800 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9v6m6-6v6m6-6v6m-9 9v-6m-6 6v-6m6 6v-6a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2z" />
          </svg>
          生成图像
        </CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="pt-4">
          <div className="grid w-full gap-4">
            <div className="flex flex-col space-y-2">
              <Label htmlFor="prompt" className="text-sm font-medium text-gray-700">图像描述</Label>
              <Textarea
                id="prompt"
                placeholder="请描述您想要生成的图像..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[120px] border-gray-300 focus:border-blue-500 focus:ring-blue-500 rounded-md resize-none"
                disabled={isLoading}
              />
              {error && (
                <div className="text-sm text-red-500 rounded-lg p-3 bg-red-50 border border-red-200 mt-2 animate-in fade-in">
                  <p className="font-semibold flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    错误：
                  </p>
                  <p>{error}</p>
                  {error.includes('速率限制') && (
                    <p className="mt-2 text-xs text-gray-600 bg-gray-100 p-2 rounded">提示：如果您频繁遇到速率限制，可以考虑使用图片编辑功能。</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className="bg-gray-50 rounded-b-lg pt-2">
          <Button 
            type="submit" 
            disabled={isLoading} 
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium py-2 rounded-md transition-all duration-200 shadow-sm"
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                生成中...
              </span>
            ) : (
              <span className="flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                生成图像
              </span>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}