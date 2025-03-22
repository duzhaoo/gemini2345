/**
 * 简单的自增长计数器
 * 用于为新生成的图片生成递增ID
 */

// 定义持久化存储的接口
import fs from 'fs';
import path from 'path';

// 根目录
const rootDir = process.cwd();
// 计数器文件路径
const counterFilePath = path.join(rootDir, 'data', 'counter.json');

// 初始化计数器数据目录
function ensureCounterDir() {
  const dataDir = path.join(rootDir, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// 从文件读取当前计数器值
function readCounter(): number {
  ensureCounterDir();
  
  try {
    if (fs.existsSync(counterFilePath)) {
      const data = fs.readFileSync(counterFilePath, 'utf8');
      const counter = JSON.parse(data);
      return counter.value || 1;
    }
  } catch (error) {
    console.error('读取计数器文件失败:', error);
  }
  
  // 如果文件不存在或读取失败，返回初始值1
  return 1;
}

// 将当前计数器值写入文件
function writeCounter(value: number): void {
  ensureCounterDir();
  
  try {
    fs.writeFileSync(counterFilePath, JSON.stringify({ value }), 'utf8');
  } catch (error) {
    console.error('写入计数器文件失败:', error);
  }
}

/**
 * 获取并递增计数器
 * @returns 当前计数器值（在递增前）
 */
export function getNextId(): number {
  // 读取当前值
  const currentValue = readCounter();
  
  // 递增并写回
  writeCounter(currentValue + 1);
  
  return currentValue;
}

/**
 * 获取当前计数器值但不递增
 * @returns 当前计数器值
 */
export function getCurrentId(): number {
  return readCounter();
}
