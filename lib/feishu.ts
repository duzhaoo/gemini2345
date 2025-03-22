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
 * @param {Buffer} buffer - 图片数据
 * @param {string} filename - 文件名
 * @param {string} mimeType - MIME类型
 * @returns {Promise<{fileToken: string, url: string, name: string}>} 上传结果
 */
export async function uploadImageToFeishu(buffer: Buffer, filename: string, mimeType: string) {
  try {
    console.log("======= 飞书图片上传开始 =======");
    console.log(`uploadImageToFeishu: 开始上传图片到飞书，文件名: ${filename}, MIME类型: ${mimeType}`);
    
    // 1. 环境变量检查
    const appId = process.env.FEISHU_APP_ID;
    const appSecret = process.env.FEISHU_APP_SECRET;
    const appToken = process.env.APP_TOKEN;
    
    console.log(`uploadImageToFeishu: 环境变量检查 - APP_ID存在: ${!!appId}, APP_SECRET存在: ${!!appSecret}, APP_TOKEN存在: ${!!appToken}`);
    
    if (!appId || !appSecret || !appToken) {
      throw new Error('缺少必要的飞书API凭证环境变量');
    }
    
    // 2. 图片大小检查
    const sizeInBytes = buffer.byteLength;
    const sizeInMB = sizeInBytes / (1024 * 1024);
    console.log(`uploadImageToFeishu: 图片大小: ${sizeInBytes} 字节 (${sizeInMB.toFixed(2)}MB)`);
    
    // 飞书图片上传限制为10MB
    if (sizeInMB > 10) {
      console.error("uploadImageToFeishu: 图片大小超过飞书限制的10MB");
      return {
        fileToken: "",
        url: "",
        error: true,
        errorMessage: `图片大小 ${sizeInMB.toFixed(2)}MB 超过飞书的10MB限制`
      };
    }
    
    // 3. 获取飞书访问令牌
    const token = await getAccessToken();
    console.log(`uploadImageToFeishu: 获取飞书access_token成功，令牌长度: ${token.length}`);
    
    // 4. 准备FormData
    const form = new FormData();
    form.append('image_type', 'message'); // 图片类型为消息图片
    form.append('image', buffer, {
      filename: filename,
      contentType: mimeType
    });
    
    console.log(`uploadImageToFeishu: 已准备FormData，准备调用API: ${BASE_URL}/im/v1/images`);
    
    // 5. 发送请求
    const startTime = new Date();
    console.log(`uploadImageToFeishu: 发送请求到飞书API，开始时间: ${startTime.toISOString()}`);
    console.log(`uploadImageToFeishu: 开始发送POST请求到 ${BASE_URL}/im/v1/images`);
    
    const response = await axios.post(`${BASE_URL}/im/v1/images`, form, {
      headers: {
        'Authorization': `Bearer ${token}`,
        ...form.getHeaders()  // 获取FormData生成的headers
      },
      timeout: 30000 // 30秒超时，上传大图片可能需要更长时间
    });
    
    const endTime = new Date();
    console.log(`uploadImageToFeishu: 请求已完成，HTTP状态码: ${response.status}`);
    console.log(`uploadImageToFeishu: 请求成功返回，结束时间: ${endTime.toISOString()}`);
    
    // 6. 处理响应
    if (response.data && response.data.code === 0 && response.data.data && response.data.data.image_key) {
      const imageKey = response.data.data.image_key;
      const imageUrl = `${BASE_URL}/im/v1/images/${imageKey}`;
      
      console.log(`uploadImageToFeishu: 图片上传成功! image_key: ${imageKey}`);
      console.log(`uploadImageToFeishu: 完整URL: ${imageUrl}`);
      console.log("======= 飞书图片上传完成 =======");
      
      return {
        fileToken: imageKey,
        url: imageUrl,
        name: filename
      };
    } else {
      // 处理API返回的错误
      const errorCode = response.data?.code || -1;
      const errorMsg = response.data?.msg || '未知错误';
      
      console.error(`uploadImageToFeishu: 飞书API错误，代码: ${errorCode}, 消息: ${errorMsg}`);
      console.error("======= 飞书图片上传失败 =======");
      
      return {
        fileToken: "",
        url: "",
        error: true,
        errorMessage: `飞书API错误: ${errorCode} - ${errorMsg}`
      };
    }
  } catch (error) {
    // 处理请求异常
    console.error(`uploadImageToFeishu: 上传图片异常: ${error.message}`);
    console.error(`uploadImageToFeishu: 错误堆栈: ${error.stack}`);
    console.error("======= 飞书图片上传异常中断 =======");
    
    let errorMessage = '未知错误';
    
    if (error.response) {
      // 服务器返回了错误状态码
      console.error(`uploadImageToFeishu: 服务器返回错误状态码: ${error.response.status}`);
      console.error(`uploadImageToFeishu: 响应数据:`, error.response.data);
      errorMessage = `服务器错误: ${error.response.status} - ${error.response.statusText || '未知错误'}`;
    } else if (error.request) {
      // 请求已发送但没有收到响应
      console.error(`uploadImageToFeishu: 请求已发送但无响应，可能是超时或网络问题`);
      errorMessage = '网络错误: 请求超时或无响应';
    } else {
      // 设置请求时发生了错误
      console.error(`uploadImageToFeishu: 请求配置错误: ${error.message}`);
      errorMessage = `请求配置错误: ${error.message}`;
    }
    
    return {
      fileToken: "",
      url: "",
      error: true,
      errorMessage
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
  timestamp: number;
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
        console.error(`saveImageRecord: 飞书API错误，代码: ${errorCode}, 消息: ${errorMsg}`);
        console.error(`saveImageRecord: 详细响应:`, JSON.stringify(response.data));
        
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
            
            // 处理timestamp字段，确保是字符串格式
            let timestamp = String(Date.now());
            if (fields.timestamp) {
              timestamp = String(fields.timestamp); // 确保转换为字符串
            }
            
            // 返回找到的记录 - 确保所有字段都是字符串类型
            const record = {
              id: String(fields.id || item.record_id || 'unknown'),
              url: String(fields.url || ''),
              fileToken: String(fileToken),
              prompt: String(fields.prompt || ''),
              timestamp: timestamp,
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
      
      // 如果没有找到匹配的记录，返回错误信息而不是创建空记录
      console.log(`getImageRecordById: 没有找到匹配的记录，ID: ${imageId}`);
      return {
        id: String(imageId),
        url: '',
        fileToken: String(imageId),
        prompt: '',
        timestamp: String(Date.now()),
        parentId: '',
        rootParentId: '',
        type: 'unknown',
        error: true,
        errorMessage: `未找到图片记录: ${imageId}`
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
          // 处理timestamp字段，确保是字符串格式
          let timestamp = String(Date.now());
          if (fields.timestamp) {
            timestamp = String(fields.timestamp); // 确保转换为字符串
          }
          
          console.log(`getImageRecordById: 成功获取图片记录，ID: ${imageId}`);
          
          // 确保所有字段都是字符串类型
          return {
            id: String(fields.id || item.record_id || 'unknown'),
            url: String(fields.url || ''),
            fileToken: String(fileToken),
            prompt: String(fields.prompt || ''),
            timestamp: timestamp,
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
            
            // 处理timestamp字段，确保是字符串格式
            let timestamp = String(Date.now());
            if (fields.timestamp) {
              timestamp = String(fields.timestamp); // 确保转换为字符串
            }
            
            // 确保所有字段都是字符串类型
            return {
              id: String(fields.id || item.record_id || 'unknown'),
              url: String(fields.url || ''),
              fileToken: String(fileToken),
              prompt: String(fields.prompt || ''),
              timestamp: timestamp,
              parentId: String(fields.parentId || ''),
              rootParentId: String(fields.rootParentId || ''),
              type: String(fields.type || 'generated')
            };
          }
        }
      }
    }
    
    // 增加更详细的日志，帮助调试
    console.log(`getImageRecordById: 未找到图片记录或响应格式不正确，ID: ${imageId}`);
    console.log('响应数据:', JSON.stringify(response.data || {}));
    
    // 返回错误信息而不是null，确保返回结构一致
    return {
      id: String(imageId),
      url: '',
      fileToken: String(imageId),
      prompt: '',
      timestamp: String(Date.now()),
      parentId: '',
      rootParentId: '',
      type: 'unknown',
      error: true,
      errorMessage: `未找到图片记录: ${imageId}`
    };
  } catch (error) {
    console.error(`getImageRecordById: 获取图片记录出错:`, error);
    // 返回错误信息而不是null，确保返回结构一致
    return {
      id: String(imageId),
      url: '',
      fileToken: String(imageId),
      prompt: '',
      timestamp: String(Date.now()),
      parentId: '',
      rootParentId: '',
      type: 'unknown',
      error: true,
      errorMessage: `获取图片记录出错: ${error.message}`
    };
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
