import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class WechatService {
  constructor(private cfg: ConfigService) {}

  /** code2Session：用小程序 wx.login 的 code 换 openid（登录唯一项） */
  async code2Session(code: string): Promise<{ openid: string; unionid?: string; sessionKey?: string }> {
    const appid = this.cfg.get('WX_APPID');
    const secret = this.cfg.get('WX_APPSECRET');
    if (!appid || !secret) throw new BadRequestException('微信配置缺失');
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`;
    const { data } = await axios.get(url, { timeout: 8000 });
    if (data.errcode) throw new BadRequestException(`微信登录失败(${data.errcode}): ${data.errmsg}`);
    return { openid: data.openid, unionid: data.unionid, sessionKey: data.session_key };
  }
}
