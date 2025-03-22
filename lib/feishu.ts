import axios from 'axios';
import FormData from 'form-data';

// 飞书API配置
const APP_ID = process.env.FEISHU_APP_ID || '';
const APP_SECRET = process.env.FEISHU_APP_SECRET || '';
const APP_TOKEN = process.env.FEISHU_APP_TOKEN || ''; // 使用APP_TOKEN代替BITABLE_ID
const TABLE_ID = process.env.FEISHU_TABLE_ID || '';
const BASE_URL = 'https://open.feishu.cn/open-apis';

// 缓存token
let accessToken = '';
let tokenExpireTime = 0;

/**
 * 获取飞书访问令牌
 * @returns {Promise<string>} 访问令牌
 */
export async function getAccessToken() {
  // 检查缓存的token是否有效
  if (accessToken && tokenExpireTime > Date.now()) {
    console.log(`getAccessToken: 使用缓存的访问令牌，剩余有效期: ${Math.round((tokenExpireTime - Date.now()) / 1000)}秒`);
    return accessToken;
  }
  
  try {
    console.log(`getAccessToken: 缓存令牌已过期或不存在，正在获取新令牌，APP_ID: ${APP_ID}`);
    
    const response = await axios.post(`${BASE_URL}/auth/v3/tenant_access_token/internal`, {
      app_id: APP_ID,
      app_secret: APP_SECRET
    });
    
    console.log(`getAccessToken: 收到令牌请求响应，状态码: ${response.data.code}`);
    
    if (response.data.code === 0) {
      accessToken = response.data.tenant_access_token;
      tokenExpireTime = Date.now() + (response.data.expire - 300) * 1000;
      console.log(`getAccessToken: 成功获取新令牌，有效期: ${response.data.expire}秒，实际使用${response.data.expire - 300}秒`);
      return accessToken;
    } else {
      console.error(`getAccessToken: 获取令牌失败，错误码: ${response.data.code}, 消息: ${response.data.msg}`);
      throw new Error(`获取飞书访问令牌失败: ${response.data.msg}`);
    }
  } catch (error: any) {
    console.error('getAccessToken: 获取飞书访问令牌出错:', {
      message: error?.message,
      status: error?.response?.status,
      statusText: error?.response?.statusText,
      responseData: error?.response?.data
    });
    throw error;
  }
}

/**
 * 上传图片到飞书文件存储
 * @param {string} imageData - 图片的Base64数据
 * @param {string} fileName - 文件名
 * @param {string} mimeType - MIME类型
 * @returns {Promise<{fileToken: string, url: string, name: string}>} 上传结果
 */
export async function uploadImageToFeishu(imageData: string, fileName: string, mimeType: string) {
  try {
    console.log("======= 飞书图片上传开始 =======");
    console.log(`uploadImageToFeishu: 开始上传图片到飞书，文件名: ${fileName}, MIME类型: ${mimeType}`);
    console.log(`uploadImageToFeishu: 环境变量检查 - APP_ID存在: ${!!APP_ID}, APP_SECRET存在: ${!!APP_SECRET}, APP_TOKEN存在: ${!!APP_TOKEN}`);
    
    // 检查图片尺寸，飞书API有大小限制
    const imageBuffer = Buffer.from(imageData, 'base64');
    const imageSizeInMB = imageBuffer.length / (1024 * 1024);
    console.log(`uploadImageToFeishu: 图片大小: ${imageBuffer.length} 字节 (${imageSizeInMB.toFixed(2)}MB)`);
    
    // 飞书API限制为10MB，如果接近限制，给出警告
    if (imageSizeInMB > 8) {
      console.warn(`uploadImageToFeishu: 警告 - 图片大小(${imageSizeInMB.toFixed(2)}MB)接近飞书API限制(10MB)`);
    }
    
    const token = await getAccessToken();
    console.log(`uploadImageToFeishu: 获取飞书access_token成功，令牌长度: ${token.length}`);
    
    // 使用飞书文档中的图片上传API
    const formData = new FormData();
    formData.append('image_type', 'message');
    formData.append('image', imageBuffer, {
      filename: fileName,
      contentType: mimeType
    });
    
    console.log(`uploadImageToFeishu: 已准备FormData，准备调用API: ${BASE_URL}/im/v1/images`);
    
    // 添加超时设置
    console.log(`uploadImageToFeishu: 发送请求到飞书API，开始时间: ${new Date().toISOString()}`);
    
    // 使用更可靠的错误处理方式
    try {
      console.log(`uploadImageToFeishu: 开始发送POST请求到 ${BASE_URL}/im/v1/images`);
      
      // 使用较低的timeout，防止请求卡住
      const response = await axios.post(
        `${BASE_URL}/im/v1/images`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Bearer ${token}`
          },
          timeout: 30000, // 降低超时时间到30秒，避免请求卡住
          maxContentLength: 15 * 1024 * 1024,  // 限制为15MB
          maxBodyLength: 15 * 1024 * 1024,     // 限制为15MB
          validateStatus: function (status) {
            return status >= 200 && status < 300; // 只接受2xx状态码
          }
        }
      );
      
      console.log(`uploadImageToFeishu: 请求已完成，HTTP状态码: ${response.status}`);
      console.log(`uploadImageToFeishu: 请求成功返回，结束时间: ${new Date().toISOString()}`);
      
      // 处理响应
      if (response.data && response.data.code === 0 && response.data.data && response.data.data.image_key) {
        const imageKey = response.data.data.image_key;
        const url = `${BASE_URL}/im/v1/images/${imageKey}`;
        
        console.log(`uploadImageToFeishu: 图片上传成功! image_key: ${imageKey}`);
        console.log(`uploadImageToFeishu: 完整URL: ${url}`);
        console.log("======= 飞书图片上传完成 =======");
        
        return {
          fileToken: imageKey,
          url: url,
          name: fileName
        };
      } else {
        // 处理飞书返回的错误
        const errorMsg = response.data.msg || '未知错误';
        const errorCode = response.data.code || -1;
        console.error(`uploadImageToFeishu: 上传失败，飞书返回错误! 错误码: ${errorCode}, 消息: ${errorMsg}`);
        
        throw new Error(`飞书API返回错误: ${errorMsg} (${errorCode})`);
      }
    } catch (error) {
      // 详细记录错误
      console.error(`uploadImageToFeishu: 上传出错: ${error.message}`);
      
      if (error.response) {
        // 服务器响应了，但状态码不是2xx
        console.error(`uploadImageToFeishu: 服务器返回错误状态码: ${error.response.status}`);
        console.error(`uploadImageToFeishu: 响应数据:`, error.response.data);
      } else if (error.request) {
        // 请求已发出但没有收到响应
        console.error(`uploadImageToFeishu: 请求已发送但无响应，可能是超时或网络问题`);
      } else {
        // 设置请求时发生了错误
        console.error(`uploadImageToFeishu: 请求配置错误: ${error.message}`);
      }
      
      console.error(`uploadImageToFeishu: 完整错误信息:`, error);
      console.error("======= 飞书图片上传失败 =======");
      
      // 返回带有错误信息的对象
      return {
        fileToken: `error-${Date.now()}`,
        url: `error://${fileName}`,
        name: fileName,
        error: true,
        errorMessage: error.message || '未知错误'
      };
    }
  } catch (error) {
    // 捕获所有其他错误
    console.error(`uploadImageToFeishu: 意外错误: ${error.message}`);
    console.error(`uploadImageToFeishu: 错误堆栈: ${error.stack}`);
    console.error("======= 飞书图片上传异常中断 =======");
    
    return {
      fileToken: `error-${Date.now()}`,
      url: `error://${fileName}`,
      name: fileName,
      error: true,
      errorMessage: `意外错误: ${error.message}`
    };
  }
}

/**
 * 保存图片记录到多维表格
 * @param {object} metadata - 图片元数据
 * @returns {Promise<object>} 保存结果
 */
export async function saveImageRecord(metadata: {
  id: string;
  url: string;
  fileToken: string;
  prompt: string;
  timestamp: string | number;  // 修改为同时接受字符串或数字类型
  parentId?: string;
  rootParentId?: string; // 添加rootParentId字段，用于跟踪编辑链的根图片
  type?: string; // 预留字段，暂不发送到飞书
}) {
  try {
    console.log("======= 保存图片记录到飞书开始 =======");
    console.log(`saveImageRecord: 开始将图片记录保存到飞书，ID: ${metadata.id}`);
    
    // 获取访问令牌
    const token = await getAccessToken();
    console.log(`saveImageRecord: 获取飞书访问令牌成功`);
    
    // 确保所有字段都是字符串类型，避免飞书API的类型转换错误
    // 构建请求数据
    const requestData = {
      fields: {
        id: String(metadata.id),
        url: String(metadata.url),
        fileToken: String(metadata.fileToken),
        prompt: String(metadata.prompt || ''),
        timestamp: String(metadata.timestamp || Date.now()), // 确保timestamp是字符串类型
        parentId: String(metadata.parentId || metadata.id), // 确保parentId不为空
        rootParentId: String(metadata.rootParentId || metadata.parentId || metadata.id), // 确保rootParentId不为空
        type: String(metadata.type || "generated") // 默认为生成的图片
      }
    };
    
    console.log(`saveImageRecord: 准备保存的数据:`, JSON.stringify(requestData));
    
    // 发送API请求
    try {
      const response = await axios.post(
        `${BASE_URL}/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000, // 减少超时时间到15秒
          validateStatus: function (status) {
            return status >= 200 && status < 300; // 只接受2xx状态码
          }
        }
      );
      
      console.log(`saveImageRecord: 记录保存成功，HTTP状态码: ${response.status}`);
      
      // 处理成功响应
      if (response.data && response.data.code === 0 && response.data.data && response.data.data.record_id) {
        const recordId = response.data.data.record_id;
        console.log(`saveImageRecord: 成功保存记录到飞书，记录ID: ${recordId}`);
        console.log("======= 保存图片记录到飞书完成 =======");
        
        return {
          record_id: recordId
        };
      } else {
        // 处理API返回的错误
        const errorCode = response.data.code || -1;
        const errorMsg = response.data.msg || '未知API错误';
        
        // 特殊检查：如果code为0且msg为success，这实际上是成功响应
        if (errorCode === 0 && errorMsg === 'success' && response.data.data && response.data.data.record) {
          const recordId = response.data.data.record.record_id || response.data.data.record.id;
          console.log(`saveImageRecord: 成功保存记录到飞书(特殊处理)，记录ID: ${recordId}`);
          console.log("======= 保存图片记录到飞书完成 =======");
          
          return {
            record_id: recordId
          };
        }
        
        console.error(`saveImageRecord: 飞书API错误，代码: ${errorCode}, 消息: ${errorMsg}`);
        console.error(`saveImageRecord: 详细响应:`, JSON.stringify(response.data));
        
        // 特殊处理：当出现TextFieldConvFail错误但数据已成功保存的情况时，返回成功状态但带警告信息
        if (errorCode === 1254060 && errorMsg === 'TextFieldConvFail') {
          console.log(`saveImageRecord: 检测到TextFieldConvFail错误，但数据可能已成功保存`);
          
          // 尝试获取记录ID
          if (response.data && response.data.data && response.data.data.record_id) {
            const recordId = response.data.data.record_id;
            console.log(`saveImageRecord: 虽有类型转换错误，但记录已保存，ID: ${recordId}`);
            console.log("======= 保存图片记录到飞书完成（带警告）=======");
            
            // 返回成功，但添加警告
            return {
              record_id: recordId,
              warning: true,
              warningMessage: `飞书API警告: ${errorCode} - ${errorMsg}，但记录已保存`
            };
          }
        }
        
        return {
          record_id: 'error',
          error: true,
          errorMessage: `飞书API错误: ${errorCode} - ${errorMsg}`
        };
      }
    } catch (error) {
      // 处理请求错误
      console.error(`saveImageRecord: 请求飞书API出错: ${error.message}`);
      
      if (error.response) {
        // 服务器响应了，但状态码不是2xx
        console.error(`saveImageRecord: 服务器返回错误状态码: ${error.response.status}`);
        console.error(`saveImageRecord: 响应数据:`, error.response.data);
        
        return {
          record_id: 'error',
          error: true,
          errorMessage: `服务器错误: ${error.response.status} - ${error.response.statusText || '未知错误'}`
        };
      } else if (error.request) {
        // 请求已发出但没有收到响应
        console.error(`saveImageRecord: 请求已发送但无响应，可能是超时或网络问题`);
        
        return {
          record_id: 'error',
          error: true,
          errorMessage: `网络错误: 请求超时或无响应`
        };
      } else {
        // 设置请求时发生了错误
        console.error(`saveImageRecord: 请求配置错误: ${error.message}`);
        
        return {
          record_id: 'error',
          error: true,
          errorMessage: `请求配置错误: ${error.message}`
        };
      }
    }
  } catch (error) {
    // 捕获所有其他错误
    console.error(`saveImageRecord: 意外错误: ${error.message}`);
    console.error(`saveImageRecord: 错误堆栈: ${error.stack}`);
    console.error("======= 保存图片记录到飞书异常中断 =======");
    
    return {
      record_id: 'error',
      error: true,
      errorMessage: `意外错误: ${error.message}`
    };
  }
}

/**
 * 获取所有图片记录
 * @returns {Promise<Array>} 图片记录列表
 */
export async function getImageRecords() {
  try {
    const token = await getAccessToken();
    
    // 获取记录列表，不指定排序（避免InvalidSort错误）
    const response = await axios.get(
      `${BASE_URL}/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          page_size: 100  // 获取最多100条记录
        }
      }
    );
    
    if (response.data.code === 0) {
      // 转换数据格式
      return response.data.data.items.map((item: any) => {
        const fields = item.fields || {};
        
        // 打印飞书返回的字段信息，用于调试
        console.log('飞书记录字段:', JSON.stringify(fields));
        
        // 直接从fileToken字段获取值
        const fileToken = fields.fileToken || '';
        
        // 处理timestamp字段（现在为文本格式）
        let timestamp = Date.now();
        if (fields.timestamp) {
          if (typeof fields.timestamp === 'string') {
            // 尝试解析中文日期格式，如果失败则使用当前时间
            try {
              // 检测是否包含中文日期格式的分隔符
              if (fields.timestamp.includes('年') || fields.timestamp.includes('/')) {
                // 使用当前时间戳，因为中文日期格式不易解析为时间戳
                console.log('检测到中文日期格式:', fields.timestamp);
              } else if (fields.timestamp.includes('-') || fields.timestamp.includes('T')) {
                // ISO格式或类似标准格式
                timestamp = new Date(fields.timestamp).getTime();
              } else if (!isNaN(Number(fields.timestamp))) {
                // 尝试作为数字解析
                timestamp = Number(fields.timestamp);
              }
            } catch (e) {
              console.warn('解析timestamp字段失败:', e);
            }
          } else if (typeof fields.timestamp === 'number') {
            timestamp = fields.timestamp;
          }
        }
        
        return {
          id: fields.id || item.record_id || 'unknown', // 使用record_id作为备选
          url: fields.url || '',
          fileToken: fileToken,
          prompt: fields.prompt || '',
          timestamp: timestamp,
          parentId: fields.parentId || null
        };
      });
    } else {
      throw new Error(`获取记录失败: ${response.data.msg}`);
    }
  } catch (error) {
    console.error('获取飞书记录出错:', error);
    throw error;
  }
}

/**
 * 根据ID或fileToken获取单个图片记录
 * @param {string} imageId - 图片ID或fileToken
 * @returns {Promise<any>} 图片记录
 */
// 创建查询缓存来减少重复调用
// 缓存键为图片ID，值为曾经获取的记录
// 注意：缓存在当前session有效，并不会持久保存
// 如果您有很大量的图片，请注意内存占用
// 可以将此缓存选项采用非全局缓存的方法，以减少内存使用
const imageRecordCache = new Map();

export async function getImageRecordById(imageId: string, skipCache = false) {
  try {
    // 先检查缓存
    if (!skipCache && imageRecordCache.has(imageId)) {
      console.log(`getImageRecordById: 使用缓存的图片记录，ID: ${imageId}`);
      return imageRecordCache.get(imageId);
    }
    
    console.log(`getImageRecordById: 开始获取图片记录，ID或fileToken: ${imageId}`);
    const token = await getAccessToken();
    
    // 如果是飞书图片ID格式（img_v3_开头），将其作为fileToken处理
    if (imageId.startsWith('img_v3_')) {
      console.log(`getImageRecordById: 输入是飞书图片格式，将其作为fileToken处理: ${imageId}`);
      
      // 获取所有记录，然后根据fileToken过滤
      const response = await axios.get(
        `${BASE_URL}/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          params: {
            page_size: 100  // 获取足够多的记录以找到匹配项
          }
        }
      );
      
      // 检查响应数据
      if (response.data && 
          response.data.code === 0 && 
          response.data.data && 
          response.data.data.items && 
          Array.isArray(response.data.data.items) && 
          response.data.data.items.length > 0) {
        
        console.log(`getImageRecordById: 开始在 ${response.data.data.items.length} 条记录中查找匹配的fileToken`);
        
        // 遍历所有记录，寻找匹配的fileToken
        for (const item of response.data.data.items) {
          const fields = item.fields || {};
          
          // 直接从fileToken字段中获取值 - 飞书表格中不存在附件字段
          const fileToken = fields.fileToken || '';
          
          // 优化匹配逻辑，提高匹配准确率
          // 1. 先检查精确匹配
          if (fileToken === imageId) {
            console.log(`getImageRecordById: 找到精确匹配的fileToken: ${fileToken}`);
          }
          // 2. 或者检查部分匹配
          else if (fileToken && (fileToken.includes(imageId) || imageId.includes(fileToken))) {
            console.log(`getImageRecordById: 找到部分匹配的fileToken: ${fileToken}, 输入ID: ${imageId}`);
          }
          
          // 如果有匹配，处理记录
          if (fileToken && (fileToken === imageId || fileToken.includes(imageId) || imageId.includes(fileToken))) {
            
            // 处理timestamp字段
            let timestamp = Date.now();
            if (fields.timestamp) {
              if (typeof fields.timestamp === 'string') {
                try {
                  if (fields.timestamp.includes('-') || fields.timestamp.includes('T')) {
                    timestamp = new Date(fields.timestamp).getTime();
                  } else if (!isNaN(Number(fields.timestamp))) {
                    timestamp = Number(fields.timestamp);
                  }
                } catch (e) {
                  console.warn('解析timestamp字段失败:', e);
                }
              } else if (typeof fields.timestamp === 'number') {
                timestamp = fields.timestamp;
              }
            }
            
            // 返回找到的记录 - 确保字段值都是字符串
            const record = {
              id: String(fields.id || item.record_id || 'unknown'),
              url: String(fields.url || ''),
              fileToken: String(fileToken),
              prompt: String(fields.prompt || ''),
              timestamp: String(timestamp),
              parentId: String(fields.parentId || ''),
              rootParentId: String(fields.rootParentId || ''),
              type: String(fields.type || 'generated')
            };
            
            // 将记录保存到缓存中
            imageRecordCache.set(imageId, record);
            imageRecordCache.set(fileToken, record); // 同时缓存fileToken和ID的映射
            
            return record;
          }
        }
      }
      
      // 如果没有找到匹配的记录，直接使用输入的ID作为fileToken
      console.log(`getImageRecordById: 没有找到匹配的记录，直接使用输入的ID作为fileToken: ${imageId}`);
      return {
        id: String(imageId),
        url: '',
        fileToken: String(imageId),
        prompt: '',
        timestamp: String(Date.now()),  // 转换为字符串类型
        parentId: '',  // 空字符串而非null
        rootParentId: '',  // 空字符串而非null
        type: 'uploaded'
      };
    }
    
    // 如果不是飞书图片ID格式，尝试通过ID查询
    console.log(`getImageRecordById: 尝试通过ID查询图片记录: ${imageId}`);
    
    // 给定一个更灵活的过滤条件，分别匹配id和fileToken字段
    const filter = `OR(CurrentValue.[id] = "${imageId}", CurrentValue.[fileToken] = "${imageId}")`;
    console.log(`getImageRecordById: 使用更灵活的过滤条件查询: ${filter}`);
    
    const response = await axios.get(
      `${BASE_URL}/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          filter: filter,
          page_size: 10  // 获取多条记录以提高匹配成功率
        }
      }
    );
    
    // 增加更多的安全检查
    if (response.data && 
        response.data.code === 0 && 
        response.data.data && 
        response.data.data.items && 
        Array.isArray(response.data.data.items)) {
      
      // 如果是直接匹配ID的查询，取第一条记录
      if (response.data.data.items.length > 0) {
        const item = response.data.data.items[0];
        const fields = item.fields || {};
        
        // 直接从fileToken字段获取值
        const fileToken = fields.fileToken || '';
        
        // 如果找到了有效的fileToken，直接返回记录
        if (fileToken) {
          // 处理timestamp字段
          let timestamp = Date.now();
          if (fields.timestamp) {
            if (typeof fields.timestamp === 'string') {
              try {
                if (fields.timestamp.includes('-') || fields.timestamp.includes('T')) {
                  timestamp = new Date(fields.timestamp).getTime();
                } else if (!isNaN(Number(fields.timestamp))) {
                  timestamp = Number(fields.timestamp);
                }
              } catch (e) {
                console.warn('解析timestamp字段失败:', e);
              }
            } else if (typeof fields.timestamp === 'number') {
              timestamp = fields.timestamp;
            }
          }
          
          console.log(`getImageRecordById: 成功获取图片记录，ID: ${imageId}`);
          
          return {
            id: String(fields.id || item.record_id || 'unknown'),
            url: String(fields.url || ''),
            fileToken: String(fileToken),
            prompt: String(fields.prompt || ''),
            timestamp: String(timestamp),
            parentId: String(fields.parentId || ''),
            rootParentId: String(fields.rootParentId || ''),
            type: String(fields.type || 'generated')
          };
        }
      }
      
      // 如果是获取所有记录的查询，尝试匹配fileToken
      if (response.data.data.items.length > 0) {
        console.log(`getImageRecordById: 尝试在 ${response.data.data.items.length} 条记录中匹配fileToken`);
        
        // 尝试匹配fileToken
        for (const item of response.data.data.items) {
          const fields = item.fields || {};
          
          // 从 fileToken 字段直接获取值
          const fileToken = fields.fileToken || '';
          
          // 检查fileToken是否匹配或包含输入的ID
          if (fileToken && (fileToken === imageId || fileToken.includes(imageId) || imageId.includes(fileToken))) {
            console.log(`getImageRecordById: 通过fileToken匹配到记录: ${fileToken}`);
            
            // 处理timestamp字段
            let timestamp = Date.now();
            if (fields.timestamp) {
              if (typeof fields.timestamp === 'string') {
                try {
                  if (fields.timestamp.includes('-') || fields.timestamp.includes('T')) {
                    timestamp = new Date(fields.timestamp).getTime();
                  } else if (!isNaN(Number(fields.timestamp))) {
                    timestamp = Number(fields.timestamp);
                  }
                } catch (e) {
                  console.warn('解析timestamp字段失败:', e);
                }
              } else if (typeof fields.timestamp === 'number') {
                timestamp = fields.timestamp;
              }
            }
            
            return {
              id: String(fields.id || item.record_id || 'unknown'),
              url: String(fields.url || ''),
              fileToken: String(fileToken),
              prompt: String(fields.prompt || ''),
              timestamp: String(timestamp),
              parentId: String(fields.parentId || ''),
              rootParentId: String(fields.rootParentId || ''),
              type: String(fields.type || 'generated')
            };
          }
        }
      }
      

    } else {
      // 增加更详细的日志，帮助调试
      console.log(`getImageRecordById: 未找到图片记录或响应格式不正确，ID: ${imageId}`);
      console.log('响应数据:', JSON.stringify(response.data || {}));
      

      
      return null;
    }
  } catch (error) {
    console.error(`getImageRecordById: 获取图片记录出错:`, error);
    return null;
  }
}

/**
 * 从飞书获取特定图片的编辑历史记录
 * @param {string} imageId - 图片ID
 * @returns {Promise<Array>} 编辑历史记录列表
 */
export async function getEditHistoryFromFeishu(imageId: string) {
  try {
    const token = await getAccessToken();
    
    // 查询与此图片相关的所有记录
    const response = await axios.get(
      `${BASE_URL}/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          page_size: 100, // 获取最多100条记录
          filter: `CurrentValue.[parentId] = "${imageId}" OR CurrentValue.[id] = "${imageId}" OR CurrentValue.[rootParentId] = "${imageId}"` // 增强过滤条件，同时包含rootParentId
        }
      }
    );
    
    if (response.data.code === 0) {
      // 转换数据格式为编辑历史格式
      return response.data.data.items.map((item: any) => {
        const fields = item.fields || {};
        
        // 处理timestamp字段
        let createdAt = new Date().toISOString();
        if (fields.timestamp) {
          try {
            if (typeof fields.timestamp === 'string') {
              if (fields.timestamp.includes('-') || fields.timestamp.includes('T')) {
                createdAt = fields.timestamp;
              } else if (!isNaN(Number(fields.timestamp))) {
                createdAt = new Date(Number(fields.timestamp)).toISOString();
              }
            } else if (typeof fields.timestamp === 'number') {
              createdAt = new Date(fields.timestamp).toISOString();
            }
          } catch (e) {
            console.warn('解析timestamp字段失败:', e);
          }
        }
        
        return {
          id: fields.id || item.record_id || 'unknown',
          imageId: fields.parentId || '', // 父图片ID作为被编辑的图片ID
          prompt: fields.prompt || '',
          resultImageId: fields.id || '', // 当前图片ID作为结果图片ID
          rootParentId: fields.rootParentId || '', // 添加rootParentId字段
          // editGroupId字段已移除
          createdAt: createdAt
        };
      }).filter((history: any) => {
        // 过滤掉不符合编辑历史要求的数据
        return history.imageId && history.resultImageId && history.id !== imageId;
      });
    } else {
      throw new Error(`获取编辑历史记录失败: ${response.data.msg}`);
    }
  } catch (error) {
    console.error('从飞书获取编辑历史出错:', error);
    return []; // 出错时返回空数组
  }
}
