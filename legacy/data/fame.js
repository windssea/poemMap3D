/* 诗词打标（手工编订）：每首最有名的句子与名气。
   id: [起句下标, 名气 1–5（5.5 为家喻户晓的顶尖名篇）, 句数（默认 2）]；名气 ≥ 4 为名篇。
   句子下标对应 poems.js 里 l 数组；注释为对应句子，便于校对。 */
window.POEM_FAME = {
  "guan-ju": [2, 5],                                 // 窈窕淑女，君子好逑。
  "jian-jia": [0, 5],                                // 蒹葭苍苍，白露为霜。
  "cai-wei": [40, 4],                                 // 昔我往矣，杨柳依依。
  "li-sao": [0, 5],                                  // 长太息以掩涕兮，哀民生之多艰。
  "guo-shang": [16, 3],                               // 身既死兮神以灵，子魂魄兮为鬼雄。
  "guan-cang-hai": [8, 4, 4],                           // 日月之行，若出其中；
  "duan-ge-xing": [0, 5],                            // 对酒当歌，人生几何！
  "tiao-tiao-qian-niu-xing": [8, 4],                 // 盈盈一水间，脉脉不得语。
  "shi-wu-cong-jun-zheng": [0, 3],                   // 十五从军征，八十始得归。
  "jiang-nan": [0, 4],                               // 江南可采莲，莲叶何田田。
  "da-feng-ge": [0, 4, 3],                              // 大风起兮云飞扬，威加海内兮归故乡，安得猛士兮守四方！
  "qiu-feng-ci": [7, 3],                             // 欢乐极兮哀情多。少壮几时兮奈老何！
  "yin-jiu-qi-wu": [4, 5],                           // 采菊东篱下，悠然见南山。
  "yong-huai-qi-yi": [0, 3],                         // 夜中不能寐，起坐弹鸣琴。
  "qi-bu-shi": [4, 5],                               // 本自同根生，相煎何太急？
  "chi-le-ge": [5, 5],                               // 野茫茫，风吹草低见牛羊。
  "wan-deng-san-shan": [4, 3],                       // 余霞散成绮，澄江静如练。
  "deng-chi-shang-lou": [14, 3],                      // 池塘生春草，园柳变鸣禽。
  "jing-ye-si": [2, 5.5],                              // 举头望明月，低头思故乡。
  "wang-lushan-pubu": [2, 5.5],                        // 飞流直下三千尺，疑是银河落九天。
  "zao-fa-bai-di-cheng": [2, 5.5],                     // 两岸猿声啼不住，轻舟已过万重山。
  "huang-he-lou-song": [2, 5.5],                       // 孤帆远影碧空尽，唯见长江天际流。
  "wang-tianmen-shan": [2, 4],                       // 两岸青山相对出，孤帆一片日边来。
  "du-zuo-jingting-shan": [2, 4],                    // 相看两不厌，只有敬亭山。
  "zeng-wang-lun": [2, 5],                           // 桃花潭水深千尺，不及汪伦送我情。
  "du-jingmen-songbie": [2, 4],                      // 山随平野尽，江入大荒流。
  "deng-jinling-fenghuang-tai": [4, 4],              // 三山半落青天外，二水中分白鹭洲。
  "mengyou-tianmu": [43, 5],                          // 安能摧眉折腰事权贵，使我不得开心颜！
  "deng-guanque-lou": [2, 5.5],                        // 欲穷千里目，更上一层楼。
  "liangzhou-ci-wangzhihuan": [2, 5.5],                // 羌笛何须怨杨柳，春风不度玉门关。
  "liangzhou-ci-wanghan": [2, 5],                    // 醉卧沙场君莫笑，古来征战几人回。
  "huang-he-lou": [0, 5.5],                            // 昔人已乘黄鹤去，此地空余黄鹤楼。
  "chu-sai": [2, 5.5],                                 // 但使龙城飞将在，不教胡马度阴山。
  "furong-lou-song": [2, 5],                         // 洛阳亲友如相问，一片冰心在玉壶。
  "cong-jun-xing": [2, 5],                           // 黄沙百战穿金甲，不破楼兰终不还。
  "chun-xiao": [0, 5.5],                               // 春眠不觉晓，处处闻啼鸟。
  "su-jiangde-jiang": [2, 4],                        // 野旷天低树，江清月近人。
  "wang-dongting-zeng": [2, 4],                      // 气蒸云梦泽，波撼岳阳城。
  "guo-gu-ren-zhuang": [2, 4],                       // 绿树村边合，青山郭外斜。
  "hui-xiang-ou-shu": [2, 5],                        // 儿童相见不相识，笑问客从何处来。
  "ci-bei-gu-shan": [4, 4],                          // 海日生残夜，江春入旧年。
  "deng-youzhou-tai": [2, 5],                        // 念天地之悠悠，独怆然而涕下。
  "wang-jimen": [6, 2],                              // 少小虽非投笔吏，论功还欲请长缨。
  "wang-yue": [6, 5.5],                                // 会当凌绝顶，一览众山小。
  "chun-wang": [0, 5.5],                               // 国破山河在，城春草木深。
  "deng-gao": [2, 5.5],                                // 无边落木萧萧下，不尽长江滚滚来。
  "chun-ye-xi-yu": [2, 5],                           // 随风潜入夜，润物细无声。
  "mao-wu-ge": [18, 5, 3],                               // 安得广厦千万间，大庇天下寒士俱欢颜，风雨不动安如山！
  "jueju-huangli": [0, 5],                           // 两个黄鹂鸣翠柳，一行白鹭上青天。
  "shu-xiang": [6, 5],                               // 出师未捷身先死，长使英雄泪满襟。
  "lv-ye-shu-huai": [2, 4],                          // 星垂平野阔，月涌大江流。
  "deng-yueyang-lou": [2, 4],                        // 吴楚东南坼，乾坤日夜浮。
  "jiangnan-feng": [2, 4],                           // 正是江南好风景，落花时节又逢君。
  "shanju-qiu-ming": [2, 5.5],                         // 明月松间照，清泉石上流。
  "song-yuan-er": [2, 5.5],                            // 劝君更尽一杯酒，西出阳关无故人。
  "jiuyue-jiu": [0, 5.5],                              // 独在异乡为异客，每逢佳节倍思亲。
  "shi-zhi-sai": [4, 5.5],                             // 大漠孤烟直，长河落日圆。
  "zhongnan-shan": [2, 3],                           // 白云回望合，青霭入看无。
  "chuzhou-xi-jian": [2, 4],                         // 春潮带雨晚来急，野渡无人舟自横。
  "fengqiao-ye-bo": [2, 5.5],                          // 姑苏城外寒山寺，夜半钟声到客船。
  "wuyi-xiang": [2, 5],                              // 旧时王谢堂前燕，飞入寻常百姓家。
  "zhuzhi-ci": [2, 4],                               // 东边日出西边雨，道是无晴却有晴。
  "wang-dongting": [2, 4],                           // 遥望洞庭山水翠，白银盘里一青螺。
  "chou-yangzhou": [4, 5],                           // 沉舟侧畔千帆过，病树前头万木春。
  "bo-qinhuai": [2, 5],                              // 商女不知亡国恨，隔江犹唱后庭花。
  "jiangnan-chun": [2, 5],                           // 南朝四百八十寺，多少楼台烟雨中。
  "qing-ming": [0, 5.5],                               // 清明时节雨纷纷，路上行人欲断魂。
  "chi-bi": [2, 4],                                  // 东风不与周郎便，铜雀春深锁二乔。
  "guo-huaqing-gong": [2, 4],                        // 一骑红尘妃子笑，无人知是荔枝来。
  "jin-se": [6, 5.5],                                  // 此情可待成追忆？只是当时已惘然。
  "ye-yu-ji-bei": [2, 5.5],                            // 何当共剪西窗烛，却话巴山夜雨时。
  "ti-ducheng-nanzhuang": [2, 5],                    // 人面不知何处去？桃花依旧笑春风。
  "jiang-xue": [2, 5.5],                               // 孤舟蓑笠翁，独钓寒江雪。
  "pipa-xing": [64, 5],                               // 同是天涯沦落人，相逢何必曾相识！
  "qiantang-hu": [4, 4],                             // 乱花渐欲迷人眼，浅草才能没马蹄。
  "yi-jiangnan": [2, 5],                             // 日出江花红胜火，春来江水绿如蓝。
  "fu-de-gu-yuan-cao": [2, 5.5],                       // 野火烧不尽，春风吹又生。
  "ti-po-shan-si": [2, 4],                           // 曲径通幽处，禅房花木深。
  "ye-wang": [2, 3],                                 // 树树皆秋色，山山唯落晖。
  "song-ling-che": [2, 3],                           // 荷笠带斜阳，青山独归远。
  "baixue-ge": [2, 5],                               // 忽如一夜春风来，千树万树梨花开。
  "lan-xi-zhao-ge": [2, 2],                          // 兰溪三日桃花雨，半夜鲤鱼来上滩。
  "shangshan-zao-xing": [2, 4],                      // 鸡声茅店月，人迹板桥霜。
  "han-shi": [0, 4],                                 // 春城无处不飞花，寒食东风御柳斜。
  "xing-lu-nan": [10, 5],                             // 长风破浪会有时，直挂云帆济沧海。
  "song-du-shaofu": [4, 5],                          // 海内存知己，天涯若比邻。
  "chun-jiang-hua-yue-ye": [0, 5.5],                   // 春江潮水连海平，海上明月共潮生。
  "lu-zhai": [0, 4],                                 // 空山不见人，但闻人语响。
  "han-jiang-lin-fan": [2, 4],                       // 江流天地外，山色有无中。
  "du-han-jiang": [2, 4],                            // 近乡情更怯，不敢问来人。
  "wang-yue-huai-yuan": [0, 5],                      // 海上生明月，天涯共此时。
  "zao-chun-zhang-shui-bu": [0, 5],                  // 天街小雨润如酥，草色遥看近却无。
  "bie-dong-da": [2, 5],                             // 莫愁前路无知己，天下谁人不识君。
  "yue-ye-yi-she-di": [2, 5],                        // 露从今夜白，月是故乡明。
  "qiu-pu-ge": [0, 4],                               // 白发三千丈，缘愁似个长。
  "xuanzhou-xietiao-lou": [10, 5],                    // 抽刀断水水更流，举杯销愁愁更愁。
  "you-zi-yin": [4, 5.5],                              // 谁言寸草心，报得三春晖。
  "deng-ke-hou": [2, 5],                             // 春风得意马蹄疾，一日看尽长安花。
  "yanmen-taishou-xing": [0, 4],                     // 黑云压城城欲摧，甲光向日金鳞开。
  "ye-shang-shou-jiang-cheng": [2, 4],               // 不知何处吹芦管，一夜征人尽望乡。
  "zhong-nan-wang-yu-xue": [2, 3],                   // 林表明霁色，城中增暮寒。
  "tao-hua-xi": [2, 3],                              // 桃花尽日随流水，洞在清溪何处边？
  "chun-han-ying": [2, 1],                           // 一夜东风吹柳绿，满城花信启春心。
  "shan-ming-niao-ti": [2, 5],                       // 只在此山中，云深不知处。
  "wang-yue-tang": [2, 3],                           // 敲成玉磬穿林响，忽作玻璃碎地声。
  "zhongqiu-yue": [2, 3],                            // 青女素娥俱耐冷，月中霜里斗婵娟。
  "wang-dongting-lu-mengtong": [0, 1],               // 客散青天月，山空碧海潮。
  "feng-qiao-jin-ye-liang": [0, 1],                  // 姑苏城外寒山寺，夜半钟声到客船。
  "jiang-shang-weng": [2, 4],                        // 君看一叶舟，出没风波里。
  "wei-chuan-tian-jia": [0, 3],                      // 斜光照墟落，穷巷牛羊归。
  "sai-xia-qu-lintao": [0, 3],                       // 饮马渡秋水，水寒风似刀。
  "feng-ru-jing-shi": [2, 4],                        // 马上相逢无纸笔，凭君传语报平安。
  "ying-zhou-ge": [2, 2],                            // 虏酒千钟不醉人，胡儿十岁能骑马。
  "gu-cong-jun-xing": [10, 3],                        // 年年战骨埋荒外，空见蒲桃入汉家。
  "xing-jing-hua-yin": [0, 2],                       // 岧峣太华俯咸京，天外三峰削不成。
  "chun-fan-ruoye-xi": [6, 2],                       // 潭烟飞溶溶，林月低向后。
  "huai-shang-xi-hui": [2, 3],                       // 浮云一别后，流水十年间。
  "cong-jun-bei-zheng": [2, 2],                      // 碛里征人三十万，一时回首月中看。
  "sai-xia-qu-yue-hei": [2, 4],                      // 欲将轻骑逐，大雪满弓刀。
  "qiu-si-luoyang": [2, 4],                          // 复恐匆匆说不尽，行人临发又开封。
  "ti-dizhi-shutang": [6, 3],                        // 少年辛苦终身事，莫向光阴惰寸功。
  "yunyang-guan-su-bie": [2, 3],                     // 乍见翻疑梦，相悲各问年。
  "song-li-zhongcheng": [6, 2],                      // 茫茫江汉上，日暮欲何之。
  "chu-ye-shi-tou-yi": [2, 3],                       // 一年将尽夜，万里未归人。
  "guo-shan-nong-jia": [0, 2],                       // 板桥人渡泉声，茅檐日午鸡鸣。
  "shi-hao-li": [0, 4],                              // 暮投石壕村，有吏夜捉人。
  "yong-huai-gu-ji-san": [2, 3],                     // 一去紫台连朔漠，独留青冢向黄昏。
  "guan-yi-mai": [8, 3],                             // 足蒸暑土气，背灼炎天光。
  "wen-le-tian-shou-jiangzhou": [2, 4],              // 垂死病中惊坐起，暗风吹雨入寒窗。
  "xun-lu-hongjian-bu-yu": [0, 2],                   // 移家虽带郭，野径入桑麻。
  "zuo-qian-lan-guan": [4, 4],                       // 云横秦岭家何在，雪拥蓝关马不前。
  "nan-yuan-shi-san": [0, 4],                        // 男儿何不带吴钩，收取关山五十州。
  "shan-zhong-wen-da": [2, 4],                       // 桃花流水窅然去，别有天地非人间。
  "ye-su-qipan-ling": [2, 2],                        // 晓月临窗近，天河入户低。
  "long-xi-xing": [2, 4],                            // 可怜无定河边骨，犹是春闺梦里人。
  "chun-yuan-jinchangxu": [0, 3],                    // 打起黄莺儿，莫教枝上啼。
  "yong-e": [2, 5],                                  // 白毛浮绿水，红掌拨清波。
  "zheng-ren-yuan": [2, 2],                          // 三春白雪归青冢，万里黄河绕黑山。
  "she-ri": [2, 3],                                  // 桑柘影斜春社散，家家扶得醉人归。
  "su-wusong-shan": [4, 2],                          // 跪进雕胡饭，月光明素盘。
  "feng-luo-yin": [2, 4],                            // 采得百花成蜜后，为谁辛苦为谁甜。
  "jiang-jin-jiu": [8, 5.5],                           // 天生我材必有用，千金散尽还复来。
  "yue-xia-du-zhuo": [2, 5],                         // 举杯邀明月，对影成三人。
  "emei-shan-yue-ge": [0, 4],                        // 峨眉山月半轮秋，影入平羌江水流。
  "ke-zhong-zuo": [2, 3],                            // 但使主人能醉客，不知何处是他乡。
  "shu-dao-nan": [2, 5.5],                             // 蜀道之难，难于上青天！
  "chun-ye-luocheng-wen-di": [2, 4],                 // 此夜曲中闻折柳，何人不起故园情。
  "deng-tai-bai-feng": [6, 2],                       // 举手可近月，前行若无山。
  "wen-wang-changling": [2, 4],                      // 我寄愁心与明月，随君直到夜郎西。
  "fang-dai-tian-shan-dao-shi": [2, 3],              // 树深时见鹿，溪午不闻钟。
  "su-tai-lan-gu": [2, 3],                           // 只今惟有西江月，曾照吴王宫里人。
  "yue-zhong-lan-gu": [2, 3],                        // 宫女如花满春殿，只今惟有鹧鸪飞。
  "nan-ling-bie-er-tong": [10, 5],                    // 仰天大笑出门去，我辈岂是蓬蒿人。
  "sha-qiu-cheng-xia-ji-dufu": [6, 2],               // 思君若汶水，浩荡寄南征。
  "chang-gan-xing": [2, 5],                          // 郎骑竹马来，绕床弄青梅。
  "heng-jiang-ci": [2, 2],                           // 一风三日吹倒山，白浪高于瓦官阁。
  "yi-qin-e": [8, 4],                                // 西风残照，汉家陵阙。
  "deng-guang-wu-gu-zhan-chang": [2, 1],             // 项王气盖世，紫电明双瞳。
  "ye-su-shan-si": [0, 5],                           // 危楼高百尺，手可摘星辰。
  "shan-zhong-yu-you-ren-dui-zhuo": [0, 3],          // 两人对酌山花开，一杯一杯复一杯。
  "guan-shan-yue": [0, 4],                           // 明月出天山，苍茫云海间。
  "ci-tongguan": [0, 2],                             // 荆山已去华山来，日照潼关四扇开。
  "ti-mu-ju-shi": [2, 2],                            // 偶然题作木居士，便有无穷求福人。
  "chun-xue": [2, 3],                                // 白雪却嫌春色晚，故穿庭树作飞花。
  "xiang-zhong": [0, 2],                             // 猿愁鱼踊水翻波，自古流传是汨罗。
  "deng-liuzhou-chenglou": [4, 3],                   // 岭树重遮千里目，江流曲似九回肠。
  "liuzhou-rongye": [2, 2],                          // 山城过雨百花尽，榕叶满庭莺乱啼。
  "yu-weng": [2, 3],                                 // 烟销日出不见人，欸乃一声山水绿。
  "nanjian-zhong-ti": [0, 2],                        // 秋气集南涧，独游亭午时。
  "shui-diao-ge-tou": [17, 5.5],                        // 但愿人长久，千里共婵娟。
  "nian-nu-jiao": [0, 5.5, 3],                            // 大江东去，浪淘尽，千古风流人物。
  "ding-feng-bo": [2, 5, 3],                            // 竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生。
  "jiangcheng-ji-meng": [0, 5, 3],                      // 十年生死两茫茫，不思量，自难忘。
  "wang-jiangnan": [8, 4],                           // 且将新火试新茶。诗酒趁年华。
  "linjiang-xian": [8, 4],                           // 小舟从此逝，江海寄余生。
  "ti-xi-lin-bi": [2, 5.5],                            // 不识庐山真面目，只缘身在此山中。
  "yin-hu-shang": [2, 5.5],                            // 欲把西湖比西子，淡妆浓抹总相宜。
  "wanghu-lou": [0, 4],                              // 黑云翻墨未遮山，白雨跳珠乱入船。
  "huan-xi-sha-qingquan": [3, 4],                    // 谁道人生无再少？门前流水尚能西！
  "gui-zhi-xiang": [17, 3],                           // 六朝旧事随流水，但寒烟衰草凝绿。
  "bo-chuan-gua-zhou": [2, 5.5],                       // 春风又绿江南岸，明月何时照我还。
  "deng-fei-lai-feng": [2, 5],                       // 不畏浮云遮望眼，自缘身在最高层。
  "yuan-ri": [0, 5],                                 // 爆竹声中一岁除，春风送暖入屠苏。
  "yu-jia-ao": [5, 4],                               // 浊酒一杯家万里，燕然未勒归无计。
  "cai-sang-zi": [0, 3, 3],                             // 群芳过后西湖好，狼籍残红，飞絮濛濛，
  "chao-zhong-ze": [0, 3],                           // 平山阑槛倚晴空，山色有无中。
  "yu-lin-ling": [14, 5.5, 3],                             // 今宵酒醒何处？杨柳岸，晓风残月。
  "wang-hai-chao": [13, 4],                           // 有三秋桂子，十里荷花。
  "huan-xi-sha-yanshu": [3, 5],                      // 无可奈何花落去，似曾相识燕归来。
  "yi-jian-mei": [9, 5, 3],                             // 此情无计可消除，才下眉头，却上心头。
  "ru-meng-ling-xiting": [3, 5, 4],                     // 误入藕花深处。争渡，争渡，惊起一滩鸥鹭。
  "ru-meng-ling-fengzhou": [4, 5, 3],                   // 知否，知否？应是绿肥红瘦。
  "zui-hua-yin": [7, 5, 3],                             // 莫道不销魂，帘卷西风，人比黄花瘦。
  "sheng-sheng-man": [0, 5.5, 3],                         // 寻寻觅觅，冷冷清清，凄凄惨惨戚戚。
  "wu-ling-chun": [2, 5],                            // 物是人非事事休，欲语泪先流。
  "yong-yu-le": [19, 5, 3],                              // 凭谁问：廉颇老矣，尚能饭否？
  "qing-yu-an": [9, 5.5, 4],                              // 众里寻他千百度，蓦然回首，那人却在，灯火阑珊处。
  "xi-jiang-yue": [2, 5],                            // 稻花香里说丰年，听取蛙声一片。
  "qing-ping-le": [6, 4],                            // 最喜小儿亡赖，溪头卧剥莲蓬。
  "po-zhen-zi": [0, 5],                              // 醉里挑灯看剑，梦回吹角连营。
  "chou-nu-er": [0, 5, 4],                              // 少年不识愁滋味，爱上层楼。爱上层楼，为赋新词强说愁。
  "shui-long-yin": [8, 4, 4],                           // 把吴钩看了，栏杆拍遍，无人会，登临意。
  "man-jiang-hong": [6, 5.5],                          // 三十功名尘与土，八千里路云和月。
  "guo-ling-ding-yang": [6, 5.5],                      // 人生自古谁无死？留取丹心照汗青。
  "ti-lin-an-di": [0, 5],                            // 山外青山楼外楼，西湖歌舞几时休？
  "you-shan-xi-cun": [2, 5],                         // 山重水复疑无路，柳暗花明又一村。
  "chai-tou-feng": [0, 5, 3],                           // 红酥手，黄縢酒，满城春色宫墙柳。
  "su-zhong-qing": [7, 4, 3],                           // 此生谁料，心在天山，老沧洲。
  "shi-yi-yue": [2, 5],                              // 夜阑卧听风吹雨，铁马冰河入梦来。
  "lin-an-chun-yu": [2, 5],                          // 小楼一夜听春雨，深巷明朝卖杏花。
  "jianmen-dao-zhong": [2, 4],                       // 此身合是诗人未？细雨骑驴入剑门。
  "xiao-chu-jing-ci": [2, 5.5],                        // 接天莲叶无穷碧，映日荷花别样红。
  "xiao-chi": [2, 5],                                // 小荷才露尖尖角，早有蜻蜓立上头。
  "su-xin-shi": [2, 4],                              // 儿童急走追黄蝶，飞入菜花无处寻。
  "guan-shu-you-gan": [2, 5],                        // 问渠那得清如许？为有源头活水来。
  "deng-kuai-ge": [2, 3],                            // 落木千山天远大，澄江一道月分明。
  "si-shi-tian-yuan": [0, 4],                        // 梅子金黄杏子肥，麦花雪白菜花稀。
  "shan-yuan-xiao-mei": [2, 5],                      // 疏影横斜水清浅，暗香浮动月黄昏。
  "qing-yu-an-hengtang": [9, 4, 4],                     // 试问闲愁都几许？一川烟草，满城风絮，梅子黄时雨。
  "su-mu-zhe": [4, 4, 3],                               // 叶上初阳干宿雨，水面清圆，一一风荷举。
  "yangzhou-man": [16, 4, 3],                            // 二十四桥仍在，波心荡，冷月无声。
  "yu-mei-ren": [0, 4],                              // 少年听雨歌楼上，红烛昏罗帐。
  "chai-tou-feng-tangwan": [0, 3, 3],                   // 世情薄，人情恶，雨送黄昏花易落。
  "yue-ke": [2, 4],                                  // 有约不来过夜半，闲敲棋子落灯花。
  "san-qu-dao-zhong": [0, 3],                        // 梅子黄时日日晴，小溪泛尽却山行。
  "xiangyi-dao-zhong": [2, 3],                       // 卧看满天云不动，不知云与我俱东。
  "linjiang-xian-xiaogui": [3, 4],                   // 落花人独立，微雨燕双飞。
  "xiangcun-siyue": [2, 4],                          // 乡村四月闲人少，才了蚕桑又插田。
  "jiangcheng-chulie": [8, 5],                       // 会挽雕弓如满月，西北望，射天狼。
  "bu-suan-zi": [6, 4],                              // 拣尽寒枝不肯栖，寂寞沙洲冷。
  "xi-jiang-yue-dameng": [0, 3],                     // 世事一场大梦，人生几度秋凉。
  "zhe-gu-tian-huangzhou": [6, 3],                   // 殷勤昨夜三更雨，又得浮生一日凉。
  "man-ting-fang-guiqu": [0, 2],                     // 归去来兮，吾归何处？
  "shui-long-yin-yanghua": [19, 4, 3],                   // 细看来，不是杨花，点点是离人泪。
  "dong-xian-ge": [14, 3],                            // 但屈指西风几时来，又不道流年暗中偷换。
  "man-jiang-hong-jie": [0, 2],                      // 江汉西来，高楼下、蒲萄深碧。
  "nan-xiang-zi-chongjiu": [7, 3, 3],                   // 万事到头都是梦，休休。明日黄花蝶也愁。
  "shui-diao-kuaizai": [16, 4],                       // 一点浩然气，千里快哉风。
  "nian-nu-jiao-zhongqiu": [11, 2],                   // 举杯邀月，对影成三客。
  "ding-feng-bo-yunniang": [8, 5],                   // 试问岭南应不好，却道：此心安处是吾乡。
  "huan-xi-sha-zaohua": [3, 3],                      // 酒困路长惟欲睡，日高人渴漫思茶。
  "yong-yu-le-pengcheng": [15, 3, 3],                    // 燕子楼空，佳人何在，空锁楼中燕。
  "jiangcheng-bie-xuzhou": [8, 3],                   // 欲寄相思千点泪，流不到，楚江东。
  "yang-guan-qu": [2, 4],                            // 此生此夜不长好，明月明年何处看。
  "xi-jiang-yue-pingshantang": [6, 3],               // 休言万事转头空。未转头时皆梦。
  "shao-nian-you-runzhou": [0, 3, 3],                   // 去年相送，余杭门外，飞雪似杨花。
  "zui-luo-po-suzhou": [0, 2],                       // 苍颜华发。故山归计何时决。
  "yu-mei-ren-youmeitang": [0, 2],                   // 湖山信是东南美，一望弥千里。
  "ba-sheng-ganzhou": [0, 3],                        // 有情风、万里卷潮来，无情送潮归。
  "linjiang-xian-songqian": [8, 5],                  // 人生如逆旅，我亦是行人。
  "mu-lan-hua-ling": [6, 2],                         // 与余同是识翁人，惟有西湖波底月。
  "xi-jiang-yue-meihua": [0, 2],                     // 玉骨那愁瘴雾，冰姿自有仙风。
  "huan-xi-sha-duanwu": [3, 2],                      // 彩线轻缠红玉臂，小符斜挂绿云鬟。
  "die-lian-hua-chunjing": [2, 5],                   // 枝上柳绵吹又少，天涯何处无芳草。
  "jian-zi-mu-lan-hua-danzhou": [0, 2],              // 春牛春杖，无限春风来海上。
  "ta-sha-xing-chenzhou": [8, 4],                    // 郴江幸自绕郴山，为谁流下潇湘去？
  "bu-suan-zi-wo-zhu": [0, 5],                       // 我住长江头，君住长江尾。
  "zhe-gu-tian-chong-guo-chan-men": [7, 4],          // 空床卧听南窗雨，谁复挑灯夜补衣。
  "an-xiang": [0, 3, 3],                                // 旧时月色，算几番照我，梅边吹笛？
  "nian-nu-jiao-guo-dongting": [7, 4],               // 悠然心会，妙处难与君说。
  "nan-xiang-zi-beiguting": [7, 5, 3],                  // 天下英雄谁敌手？曹刘。生子当如孙仲谋。
  "shi-er": [2, 5],                                  // 王师北定中原日，家祭无忘告乃翁。
  "xia-ri-jue-ju": [0, 5],                           // 生当作人杰，死亦为鬼雄。
  "hua-mei-niao": [2, 4],                            // 始知锁向金笼听，不及林间自在啼。
  "si-shi-tian-yuan-qi-san": [0, 4],                 // 昼出耘田夜绩麻，村庄儿女各当家。
  "zhou-guo-an-ren": [2, 3],                         // 怪生无雨都张伞，不是遮头是使风。
  "shi-li-zhi": [2, 5],                              // 日啖荔枝三百颗，不辞长作岭南人。
  "mei-hua-jueju": [2, 5],                           // 遥知不是雪，为有暗香来。
  "you-zhong-shan": [2, 2],                          // 山花落尽山长在，山水空流山自闲。
  "chun-ri-ou-cheng": [2, 5],                        // 等闲识得东风面，万紫千红总是春。
  "chun-ye-wang-ling": [2, 3],                       // 子规夜半犹啼血，不信东风唤不回。
  "qing-ming-wangyucheng": [2, 3],                   // 昨日邻家乞新火，晓窗分与读书灯。
  "jianglou-ganhuai": [2, 4],                        // 同来望月人何处？风景依稀似去年。
  "chang-e-daozhong": [2, 5],                        // 嫦娥应悔偷灵药，碧海青天夜夜心。
  "gu-tong": [2, 2],                                 // 凌霄不屈己，得地本虚心。
  "tian-xian-zi": [6, 4],                            // 沙上并禽池上暝，云破月来花弄影。
  "mu-lan-hua-wuxing": [6, 2],                       // 中庭月色正清明，无数杨花过无影。
  "zhe-gu-tian-xidu": [7, 3],                        // 玉楼金阙慵归去，且插梅花醉洛阳。
  "xi-jiang-yue-zufeng": [0, 3],                     // 满载一船秋色，平铺十里湖光。
  "he-xin-lang-song-hu": [7, 3],                     // 天意从来高难问，况人情老易悲难诉！
  "bu-suan-zi-yanrui": [6, 3],                       // 若得山花插满头，莫问奴归处。
  "qin-yuan-chun-chaoyang": [13, 2],                  // 人生翕欻云亡。好烈烈轰轰做一场。
  "man-ting-fang-wuxiangshan": [0, 2, 3],               // 风老莺雏，雨肥梅子，午阴嘉树清圆。
  "xing-xiang-zi-cunzhuang": [6, 3, 3],                 // 有桃花红，李花白，菜花黄。
  "yu-mei-ren-yizhou": [0, 2],                       // 天涯也有江南信，梅破知春近。
  "yue-xia-di": [0, 1, 3],                              // 万里孤云，清游渐远，故人何处？
  "dong-xian-ge-sizhou": [0, 1],                     // 青烟幂处，碧海飞金镜。
  "liu-shao-qing-chungan": [0, 2, 3],                   // 铁马蒙毡，银花洒泪，春入愁城。
  "yi-cong-hua-xitang": [0, 2],                      // 冰轮斜辗镜天长，江练隐寒光。
  "mu-lan-hua-suizhou": [0, 2],                      // 城上风光莺语乱，城下烟波春拍岸。
  "ruan-lang-gui-poyang": [0, 2],                    // 江南江北雪漫漫，遥知易水寒。
  "su-mu-zhe-qingzhou": [11, 5, 3],                      // 明月楼高休独倚。酒入愁肠，化作相思泪。
  "die-lian-hua-jian-ju": [5, 5, 3],                    // 昨夜西风凋碧树，独上高楼，望尽天涯路。
  "man-ting-fang-feng-lao": [0, 2, 3],                  // 风老莺雏，雨肥梅子，午阴嘉树清圆。
  "qian-qiu-sui": [9, 4, 4],                            // 天不老，情难绝。心似双丝网，中有千千结。
  "ta-sha-xing-hou-guan": [8, 4],                    // 平芜尽处是春山，行人更在春山外。
  "dian-jiang-chun-qiu-qian": [6, 4, 3],                // 和羞走，倚门回首，却把青梅嗅。
  "xi-fen-fei": [0, 2],                              // 泪湿阑干花著露，愁到眉峰碧聚。
  "xing-xiang-zi-qi-li-lai": [0, 2],                 // 一叶舟轻，双桨鸿惊。
  "pu-sa-man-zaokou": [4, 5],                        // 青山遮不住，毕竟东流去。
  "shui-long-yin-shuangxilou": [0, 3],               // 举头西北浮云，倚天万里须长剑。
  "qiu-bo-mei-gaoxingting": [0, 2],                  // 秋到边城角声哀，烽火照高台。
  "xi-jiang-yue-huanglingmiao": [0, 3],              // 满载一船秋色，平铺十里湖光。
  "shui-diao-ge-tou-caishiji": [0, 2],               // 雪洗虏尘静，风约楚云留。
  "nian-nu-jiao-duojinglou": [0, 2],                 // 危楼还望，叹此意、今古几人曾会。
  "tang-duo-ling-wuchang": [9, 4, 3],                   // 欲买桂花同载酒，终不似，少年游。
  "he-xin-lang-fuzhou": [6, 3],                      // 天意从来高难问，况人情老易悲难诉。
  "qi-tian-le-chan": [0, 1],                         // 一襟余恨宫魂断，年年翠阴庭树。
  "yi-jian-mei-wujiang": [9, 5, 3],                     // 流光容易把人抛，红了樱桃，绿了芭蕉。
  "xi-da-yuan-zhen": [0, 3],                         // 春风疑不到天涯，二月山城未见花。
  "die-lian-hua-shen-shen": [8, 4],                  // 泪眼问花花不语，乱红飞过秋千去。
  "yu-lou-chun-guizhi": [2, 5],                      // 人生自是有情痴，此恨不关风与月。
  "fengle-ting-youchun": [2, 3],                     // 游人不管春将老，来往亭前踏落花。
  "shu-huyin-xiansheng-bi": [2, 4],                  // 一水护田将绿绕，两山排闼送青来。
  "bei-bei-xing-hua": [2, 3],                        // 纵被春风吹作雪，绝胜南陌碾成尘。
  "die-ti-wujiang-ting": [2, 3],                     // 江东子弟今虽在，肯与君王卷土来？
  "cheng-nan": [2, 3],                               // 一番桃李花开尽，惟有青青草色齐。
  "yong-liu": [2, 3],                                // 解把飞花蒙日月，不知天地有清霜。
  "ganlu-si-duojinglou": [4, 2],                     // 一川钟呗淮南月，万里帆樯海外风。
  "huai-mianchi-ji-zizhan": [0, 2],                  // 相携话别郑原上，共道长途怕雪泥。
  "xiaoyao-tang-huisu": [2, 2],                      // 误喜对床寻旧约，不知漂泊在彭城。
  "nan-chuang": [0, 1],                              // 京师三日雪，雪尽泥方深。
  "jiu-ri-he-hanweigong": [4, 2],                    // 佳节久从愁里过，壮心偶傍醉中来。
  "you-jiazhou-longyan": [8, 1],                     // 山川随望阔，气候带霜清。
  "tuci-changan": [26, 1],                            // 富贵不足爱，浮云过长天。
};
