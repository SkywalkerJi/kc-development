export interface Api_EquipInfo {
  id: number;
  name: string;
  火力: number;
  装甲: number;
  雷装: number;
  爆装: number;
  对空: number;
  对潜: number;
  命中_对爆: number;
  回避_迎击: number;
  索敌: number;
  射程: number;
  稀有度: number;
  运: number;
  航程?: number;
  配置消耗?: number;
  types: number[];
  broken: number[];
  
  // 获取射程文字表示
  getRange?: () => string;
}

// 实现接口的装备信息类
export class EquipInfo implements Api_EquipInfo {
  id: number = 0;
  name: string = '';
  火力: number = 0;
  装甲: number = 0;
  雷装: number = 0;
  爆装: number = 0;
  对空: number = 0;
  对潜: number = 0;
  命中_对爆: number = 0;
  回避_迎击: number = 0;
  索敌: number = 0;
  射程: number = 0;
  稀有度: number = 0;
  运: number = 0;
  航程?: number;
  配置消耗?: number;
  types: number[] = [];
  broken: number[] = [];
  
  // 根据C#实现获取射程文字表示
  getRange(): string {
    let result = '';
    switch (this.射程) {
      case 0:
        result = '无';
        break;
      case 1:
        result = '短';
        break;
      case 2:
        result = '中';
        break;
      case 3:
        result = '长';
        break;
      case 4:
        result = '超长';
        break;
      case 5:
        result = '超长+';
        break;
    }
    return result;
  }
}

// 装备类型枚举，对应C#中的装备T3
export enum EquipmentType3 {
  小主 = 1,
  中主 = 2,
  大主 = 3,
  副炮 = 4,
  鱼雷 = 5,
  舰战 = 6,
  舰爆 = 7,
  舰攻 = 8,
  舰侦 = 9,
  水上机 = 10,
  电探 = 11,
  对空弹 = 12,
  对舰弹 = 13,
  损管 = 14,
  机枪 = 15,
  高角炮 = 16,
  爆雷 = 17,
  声呐 = 18,
  锅 = 19,
  登陆艇 = 20,
  旋翼机 = 21,
  对潜机 = 22,
  钢板 = 23,
  探照灯 = 24,
  桶 = 25,
  修理 = 26,
  照明弹 = 27,
  司令部 = 28,
  扳手 = 29,
  高射 = 30,
  火箭弹 = 31,
  见张 = 32,
  大艇 = 33,
  饭团 = 34,
  补给 = 35,
  内火艇 = 36,
  陆攻 = 37,
  局战 = 38,
  景云 = 39,
  橘花 = 40,
  彩云尸 = 41,
  SS电探 = 42,
  水战 = 43,
  陆战 = 44,
  夜战 = 45,
  夜攻 = 46,
  东海 = 47,
  袭击机 = 48,
  重爆 = 49,
  夜侦 = 50,
  夜瑞云 = 51,
  陆军 = 52,
  拉烟 = 54,
  气球 = 55,
  Me = 56,
  局震电 = 57,
  夜爆 = 58
} 