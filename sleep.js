const fs = require("fs");
const path = require("path");
const axios = require("axios");
const colors = require("colors");
const readline = require("readline");
const user_agents = require("./config/userAgents");
const settings = require("./config/config");
const { sleep, loadData, saveToken, isTokenExpired, saveJson, updateEnv } = require("./utils");
const { checkBaseUrl } = require("./checkAPI");

class ClientAPI {
  constructor(accountIndex, initData, session_name, baseURL) {
    this.accountIndex = accountIndex;
    this.queryId = initData;
    this.headers = {
      Accept: "application/json, text/plain, */*",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
      "Content-Type": "application/json",
      Origin: "https://tg-sleepagotchi-tmp-cdn.sfo3.digitaloceanspaces.com",
      referer: "https://tg-sleepagotchi-tmp-cdn.sfo3.digitaloceanspaces.com/",
      "Sec-Ch-Ua": '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    };
    this.session_name = session_name;
    this.session_user_agents = this.#load_session_data();
    this.skipTasks = settings.SKIP_TASKS;
    this.baseURL = baseURL;
  }

  #load_session_data() {
    try {
      const filePath = path.join(process.cwd(), "session_user_agents.json");
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      if (error.code === "ENOENT") {
        return {};
      } else {
        throw error;
      }
    }
  }

  #get_random_user_agent() {
    const randomIndex = Math.floor(Math.random() * user_agents.length);
    return user_agents[randomIndex];
  }

  #get_user_agent() {
    if (this.session_user_agents[this.session_name]) {
      return this.session_user_agents[this.session_name];
    }

    this.log(`Tạo user agent...`);
    const newUserAgent = this.#get_random_user_agent();
    this.session_user_agents[this.session_name] = newUserAgent;
    this.#save_session_data(this.session_user_agents);
    return newUserAgent;
  }

  #save_session_data(session_user_agents) {
    const filePath = path.join(process.cwd(), "session_user_agents.json");
    fs.writeFileSync(filePath, JSON.stringify(session_user_agents, null, 2));
  }

  #get_platform(userAgent) {
    const platformPatterns = [
      { pattern: /iPhone/i, platform: "ios" },
      { pattern: /Android/i, platform: "android" },
      { pattern: /iPad/i, platform: "ios" },
    ];

    for (const { pattern, platform } of platformPatterns) {
      if (pattern.test(userAgent)) {
        return platform;
      }
    }

    return "Unknown";
  }

  set_headers() {
    const platform = this.#get_platform(this.#get_user_agent());
    this.headers["sec-ch-ua"] = `"Not)A;Brand";v="99", "${platform} WebView";v="127", "Chromium";v="127`;
    this.headers["sec-ch-ua-platform"] = platform;
    this.headers["User-Agent"] = this.#get_user_agent();
  }

  async log(msg, type = "info") {
    const accountPrefix = `[Tài khoản ${this.accountIndex + 1}]`;
    let logMessage = "";

    switch (type) {
      case "success":
        logMessage = `${accountPrefix} ${msg}`.green;
        break;
      case "error":
        logMessage = `${accountPrefix} ${msg}`.red;
        break;
      case "warning":
        logMessage = `${accountPrefix} ${msg}`.yellow;
        break;
      case "custom":
        logMessage = `${accountPrefix} ${msg}`.magenta;
        break;
      default:
        logMessage = `${accountPrefix} ${msg}`.blue;
    }
    console.log(logMessage);
  }

  async makeRequest(url, method, data = {}, retries = 1) {
    const headers = {
      ...this.headers,
    };
    let currRetries = 0,
      success = false;
    do {
      try {
        const response = await axios({
          method,
          url: `${url}?${this.queryId}`,
          data,
          headers,
          timeout: 30000,
        });
        success = true;
        if (response.data) return { success: true, data: response.data };
        return { success: false, data: response.data };
      } catch (error) {
        if (error.status == 400) {
          return { success: false, error: error.message };
        }
        this.log(`Yêu cầu thất bại: ${url} | ${error.message} | đang thử lại...`, "warning");
        success = false;
        await sleep(settings.DELAY_BETWEEN_REQUESTS);
        if (currRetries == retries) return { success: false, error: error.message };
      }
      currRetries++;
    } while (currRetries <= retries && !success);
  }

  async getUserInfo() {
    return this.makeRequest(`${this.baseURL}/getUserData`, "get");
  }

  async getReff() {
    return this.makeRequest(`${this.baseURL}/getReferralsInfo`, "post", {
      page: 1,
      rowsPerPage: 20,
    });
  }
  async claimReff() {
    return this.makeRequest(`${this.baseURL}/claimReferralRewards`, "get");
  }

  async getAllHeroes() {
    return this.makeRequest(`${this.baseURL}/getAllHeroes`, "get");
  }

  async levelUpHero(payload) {
    return this.makeRequest(`${this.baseURL}/levelUpHero`, "post", payload);
  }

  async starUpHero(payload) {
    return this.makeRequest(`${this.baseURL}/starUpHero`, "post", payload);
  }

  async claimChallengesRewards() {
    return this.makeRequest(`${this.baseURL}/claimChallengesRewards`, "get");
  }

  async getShop() {
    return this.makeRequest(`${this.baseURL}/getShop`, "get");
  }

  async getConstellations(payload) {
    return this.makeRequest(`${this.baseURL}/getConstellations`, "post", payload);
  }

  async getClans() {
    return this.makeRequest(`${this.baseURL}/listClans`, "post", {
      page: 1,
      rowsPerPage: 20,
      search: "",
    });
  }

  async joinClan(id) {
    return this.makeRequest(`${this.baseURL}/joinClan`, "post", {
      clanId: id,
    });
  }

  async useRedeemCode(code) {
    return this.makeRequest(`${this.baseURL}/useRedeemCode`, "post", {
      code: code,
    });
  }

  async unlockChallenge(payload) {
    //     {
    //     "challengeType": "greenChallenge040"
    // }
    return this.makeRequest(`${this.baseURL}/unlockChallenge`, "post", payload);
  }

  async sendToChallenge(payload) {
    return this.makeRequest(`${this.baseURL}/sendToChallenge`, "post", payload);
  }

  async byShop() {
    return this.makeRequest(`${this.baseURL}/buyShop`, "post", {
      slotType: "free",
    });
  }

  async spendGacha(payload) {
    return this.makeRequest(`${this.baseURL}/spendGacha`, "post", payload);
  }

  async getDailyRewards() {
    return this.makeRequest(`${this.baseURL}/getDailyRewards`, "get");
  }

  async claimDailyRewards() {
    return this.makeRequest(`${this.baseURL}/claimDailyRewards`, "get");
  }

  async getValidToken(isRf = false) {
    const userId = this.session_name;
    const existingToken = this.token;
    const existingRefreshToken = this.rfToken;
    let loginResult = null;

    const isExp = isTokenExpired(!isRf ? existingToken : existingRefreshToken);
    if (!isRf && existingToken && !isExp) {
      this.log("Using valid token", "success");
      return { access_token: existingToken, refresh_token: existingRefreshToken };
    } else if (!isRf && existingToken && isExp) {
      this.log("Token expired, refreshing token...", "info");
      return await this.getValidToken(true);
    } else if (isRf && existingRefreshToken && !isExp) {
      loginResult = await this.refreshToken();
    } else {
      this.log("Token not found or expired, logging in...", "warning");
      loginResult = await this.auth();
    }
    // console.log(loginResult);
    if (loginResult?.success) {
      const { refresh_token, access_token } = loginResult?.data;
      if (access_token) {
        saveToken(userId, access_token);
        this.token = access_token;
      }
      if (refresh_token) {
        saveJson(userId, refresh_token, "refresh_token.json");
        this.rfToken = refresh_token;
      }
      return { access_token: access_token, refresh_token: refresh_token };
    } else {
      this.log(`Can't get token, try get new query_id!`, "warning");
    }
    return { access_token: null, refresh_token: null };
  }

  async handleTasks() {
    const resTasks = await this.missionLists();
    if (resTasks.success) {
      const tasks = resTasks.data.filter((task) => !settings.SKIP_TASKS.includes(task.id) && !task.claimed_at);
      if (tasks.length == 0) {
        return this.log(`No tasks to do!`, "warning");
      }
      for (const task of tasks) {
        this.log(`Completting task ID: ${task.id} | Title: ${task.name}...`);
        await sleep(1);
        const { client_tasks } = task;

        try {
          if (client_tasks[1] && client_tasks[1].type == "WAIT") {
            this.log(`Waiting for ${client_tasks[1].payload} seconds to claim the task...`);
            await sleep(client_tasks[1].payload);
          }
        } catch (error) {}

        const resClaim = await this.missionClaim(task.id);
        if (resClaim.success) {
          this.log(`Completed task ${task.id} | ${task.name} successfully!`, "success");
        } else {
          this.log(`Completed task ${task.id} | ${task.name} failed!`, "warning");
        }
      }
    } else {
      this.log(`Can't get tasks.`, "warning");
    }
  }

  async handleDaily(data) {
    const { meta } = data;
    if (!meta.isNextDailyRewardAvailable) return this.log(`You checked in today!`, "warning");
    const resDaily = await this.getDailyRewards();

    if (resDaily.success) {
      const { rewards } = resDaily.data;
      const today = rewards.find((r) => r.state == "availible");
      if (today) {
        this.log(`Start chekin...`);
        const resCheck = await this.claimDailyRewards();
        if (resCheck.success) {
          this.log(`Checkin success! | Reward: ${today.rewardAmount} ${today.rewardType}`, "success");
        }
      }
    }
  }

  async handleGacha(data) {
    const { resources, meta } = data;
    let totalTicket = resources.gacha.amount;
    let resGacha = { success: false };
    if (Date.now() > meta.freeGachaNextClaim) {
      resGacha = await this.spendGacha({
        amount: 1,
        strategy: "free",
      });
      if (resGacha.success) {
        for (const hero of resGacha.data.heroCard) this.log(`Gacha free success! Reward: ${hero.amount} ${hero.heroType}`, "custom");
      }
    }

    while (totalTicket > 0) {
      await sleep(1);
      if (totalTicket >= 10) {
        resGacha = await this.spendGacha({
          amount: 10,
          strategy: "gacha",
        });
        totalTicket -= 10;
      } else {
        resGacha = await this.spendGacha({
          amount: 1,
          strategy: "gacha",
        });
        totalTicket--;
      }
      if (resGacha.success) {
        for (const hero of resGacha.data.heroCard) this.log(`Gacha success! Reward: ${hero.amount} ${hero.heroType}`, "custom");
      }
    }

    return;
  }

  async handleUpgradeHeroes(data) {
    this.log(`Checking upgrade hero...`);
    let { heroes, resources } = data;
    const { greenStones, gold, heroCard } = resources;
    let goldAvailable = gold.amount,
      greenStonesAvailable = greenStones.amount;

    const typeMapping = {
      Legendary: 1,
      Epic: 2,
      Rare: 3,
    };

    const upgrades = heroes
      .map((hero) => {
        let type,
          cards = 0;
        const item = heroCard.find((h) => h.heroType === hero.heroType);
        if (item) {
          cards = item.amount;
        }

        if (hero.heroType.endsWith("3") || hero.heroType.endsWith("Legendary")) {
          type = "Legendary"; // Hậu tố 3 là Legendary
        } else if (hero.heroType.endsWith("2") || hero.heroType.endsWith("Epic")) {
          type = "Epic"; // Hậu tố 2 là Epic
        } else {
          type = "Rare"; // Hậu tố Rare
        }
        return {
          ...hero,
          type,
          cards,
        };
      })
      .filter(
        (h) =>
          h.unlockAt == 0 &&
          ((h.cards >= h.costStar && h.stars < h.maxStars) ||
            (settings.TYPE_UPGRADE_HERO.includes(h.type) && h.level < settings.MAX_LEVEL_UGRADE_HERO && h.costLevelGreen <= greenStonesAvailable && h.costLevelGold <= goldAvailable))
      )
      .sort((a, b) => typeMapping[a.type] - typeMapping[b.type]);
    if (upgrades.length == 0) {
      return this.log(`No hero available to upgrade!`, "warning");
    }
    for (const hero of upgrades) {
      //up level
      if (hero.cards >= hero.costStar && hero.stars < hero.maxStars) {
        const resUpStar = await this.starUpHero({
          heroType: hero.heroType,
        });
        if (resUpStar.success) {
          this.log(`Upgrade hero ${hero.name} to star ${hero.stars + 1} successful!`, "success");
          data = resUpStar.data.player;
        }
      }

      //up star
      if (hero.costLevelGreen > greenStonesAvailable || hero.costLevelGold > goldAvailable) continue;
      await sleep(1);
      this.log(`Starting upgrade hero ${hero.name} | level ${hero.level} | Star ${hero.stars}...`, "info");

      const resUp = await this.levelUpHero({
        heroType: hero.heroType,
      });

      if (resUp.success) {
        this.log(`Upgrade hero ${hero.name} to level ${hero.level + 1} successful!`, "success");
        greenStonesAvailable -= hero.costLevelGreen;
        goldAvailable -= hero.costLevelGold;
        data = resUp.data.player;
      } else {
        this.log(`Upgrade hero ${hero.name} failed!`, "warning");
      }
    }

    return await this.handleUpgradeHeroes(data);
  }

  async handleShop() {
    const res = await this.getShop();
    if (!res.success) return;
    const shopFree = res.data.shop.find((s) => s.slotType == "free");
    if (shopFree && Date.now() > shopFree?.nextClaimAt) {
      const claimRes = await this.byShop();
      if (claimRes.success) {
        this.log(`Buy shop free success! | Reward: ${shopFree.content[0].amount} ${shopFree.content[0].resourceType}`, "success");
      }
    }
  }

  async handleReff() {
    const result = await this.getReff();
    if (result.success) {
      const { claimAvailible } = result.data;
      if (claimAvailible) {
        await this.claimReff();
      }
    }
  }

  async handleGame(data) {
    let { meta, heroes } = data;
    heroes = heroes.filter((h) => h.unlockAt == 0).sort((a, b) => b.power - a.power);
    let result = {
      success: false,
      data: { constellations: [] },
    };
    let startIndexMap = settings.MAP_RANGE_CHALLENGE[0] - 1;
    let endIndexMap = meta.constellationsLastIndex;
    if (
      settings.MAP_RANGE_CHALLENGE[1] == 0 ||
      !settings.ENABLE_MAP_RANGE_CHALLENGE ||
      (settings.MAP_RANGE_CHALLENGE[0] == 0 && settings.MAP_RANGE_CHALLENGE[1] == 0) ||
      settings.MAP_RANGE_CHALLENGE[0] > settings.MAP_RANGE_CHALLENGE[1]
    ) {
      startIndexMap = meta.constellationsLastIndex;
    } else {
      endIndexMap = Math.min(meta.constellationsLastIndex, Math.max(0, settings.MAP_RANGE_CHALLENGE[1] - 1));
    }
    if (endIndexMap - startIndexMap > 10) {
      this.log(`WARNING: Range map clear > 10 [Start at: ${endIndexMap} , End at: ${endIndexMap}]. Should be less than 10`);
    }
    for (let i = startIndexMap; i <= endIndexMap; i++) {
      this.log(`Checking challenge map ${i + 1}`);
      await sleep(2);
      const res = await this.getConstellations({
        amount: 1,
        startIndex: i,
      });
      if (res.success) {
        result = {
          success: true,
          data: { constellations: [...result.data.constellations, ...res.data.constellations] },
        };
      }
    }

    const { constellations } = result.data;
    if (!result.success || constellations.length == 0) return;

    if (constellations.length > 0) {
      for (const constellation of constellations) {
        this.log(`Starting game at map ${constellation.name}`);
        const challenges = constellation.challenges.filter((c) => c.received < c.value);
        if (challenges.length == 0) {
          this.log(
            `You are proccessing challenge ${startIndexMap == endIndexMap ? `at map ${endIndexMap + 1}` : `from map ${startIndexMap + 1} to ${endIndexMap + 1}`} | No challenge to go at map ${
              constellation.name
            }`,
            "warning"
          );
          continue;
        }
        for (const change of challenges) {
          await sleep(1);
          if (Date.now() < change.unlockAt) {
            const timeDifference = change.unlockAt - Date.now();
            const seconds = Math.floor((timeDifference / 1000) % 60);
            const minutes = Math.floor((timeDifference / (1000 * 60)) % 60);
            const hours = Math.floor((timeDifference / (1000 * 60 * 60)) % 24);
            this.log(`Waiting for ${hours} hours ${minutes} minutes ${seconds} seconds to complete challenge ${change.name}...`.yellow);
            continue;
          }
          if (change.cooldown > 0) continue;

          let orderedSlots = [];
          let orderedHeroId = [];
          let isPlay = true;
          for (let index = 0; index < change.orderedSlots.length; index++) {
            const slot = change.orderedSlots[index];
            if (!slot.unlocked) continue;
            // fs.writeFileSync("save.json", JSON.stringify(heroes, null, 2), "utf-8");
            const hero = heroes.find((h) => !orderedHeroId.includes(h.heroType) && (slot.optional ? true : h.class == slot.heroClass) && h.level >= change.minLevel && h.stars >= change.minStars);
            if (hero) {
              orderedHeroId.push(hero.heroType);
              orderedSlots.push({
                heroType: hero.heroType,
                slotId: index,
                skill: hero.skill,
              });
            } else {
              continue;
            }
          }

          //check slot
          const hasHeroMapSkill = orderedSlots.find((s) => s.skill == change.heroSkill);
          if (orderedSlots.length == 0 && !hasHeroMapSkill) {
            isPlay = false;
            this.log(`No hero avaliable to go change ${change.name}`, "warning");
          }

          // let payload = {}
          if (isPlay) {
            let payload = {
              challengeType: change.challengeType,
              heroes: orderedSlots,
            };
            payload = {
              ...payload,
              heroes: payload.heroes.map((item) => ({ heroType: item.heroType, slotId: item.slotId })),
            };
            this.log(`Starting change ${change.name} | Reward received: ${change.received}/${change.value} ${change.resourceType} | Time: ${change.time} seconds...`);
            const resChange = await this.sendToChallenge(payload);
            if (resChange.success) {
              this.log(`Started change ${change.name} | Reward ${change.resourceType} successfully`, "success");
              heroes = resChange.data.player.heroes.filter((h) => h.unlockAt == 0).sort((a, b) => b.power - a.power);
            } else {
              this.log(`Started change ${change.name} failed`, "warning");
              console.log(resChange);
            }
          }
        }
      }
    }
  }

  async handleClan(data) {
    const { clanInfo } = data;
    if (clanInfo?.clanId) {
      this.log(`Joined clan ${clanInfo.name}!`, "warning");
      return;
    }
    const result = await this.getClans();
    if (!result.success) return;
    const { items } = result.data;
    if (items?.length > 0) {
      const index = Math.floor(Math.random() * items.length);
      let clan = items[index];

      const resJoin = await this.joinClan(clan.id);
      if (resJoin.success) {
        this.log(`Join clan ${clan.name} sucessfully!`, "success");
      }
    }
  }

  async handleCode() {
    this.log(`Checking gift code...`);
    const codes = settings.CODE_GATEWAY;
    for (const code of codes) {
      const result = await this.useRedeemCode(code);
      if (result.success) {
        let { rewards } = result.data;
        rewards = Object.entries(rewards);
        for (const reward of rewards) {
          this.log(`Code ${code} sucessfully! | Reward: ${reward[1]?.amount} ${reward[0]}`, "success");
        }
      } else {
        this.log(`Code ${code} wrong or expried or claimed!`, "warning");
      }
    }
  }

  async handleClaim(data) {
    const { meta } = data;
    if (Date.now() > meta.nextChallengeClaimDate && meta.nextChallengeClaimDate > 0) {
      const ressult = await this.claimChallengesRewards();
      if (ressult.success) {
        let { rewards } = ressult.data;
        rewards = Object.entries(rewards);
        for (const reward of rewards) {
          this.log(`Claimed challenge successfully! | Reward: ${reward[1].amount} ${reward[0]}`, "success");
        }
      }
    }
  }
  async processAccount() {
    let userData = { success: false },
      retries = 0;
    do {
      userData = await this.getUserInfo();
      if (userData?.success) break;
      retries++;
    } while (retries < 2);

    // process.exit(0);
    if (userData.success) {
      const { initData, player, verified } = userData.data;
      const { resources } = player;
      this.log(
        `Username: ${initData.username} | Gem: ${resources.gem.amount} | Gold: ${resources.gold.amount} | Green stone: ${resources.greenStones.amount} | Purple stone: ${
          resources.purpleStones.amount
        } | Verified: ${verified.toString()}`
      );

      if (settings.AUTO_CODE_GATEWAY) {
        await this.handleCode();
      }

      await this.handleDaily(player);
      await sleep(1);
      await this.handleClaim(player);
      await sleep(1);
      await this.handleShop();
      await sleep(1);
      await this.handleGacha(player);

      await this.handleClan(player);

      if (settings.AUTO_UGRADE_HERO) {
        await sleep(1);
        await this.handleUpgradeHeroes(player);
      }

      if (settings.AUTO_CHALLENGE) {
        await sleep(1);
        await this.handleGame(player);
      }
    } else {
      return this.log("Can't get use info...skipping", "error");
    }
  }
}

async function wait(seconds) {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r${colors.cyan(`[*] Chờ ${Math.floor(i / 60)} phút ${i % 60} giây để tiếp tục`)}`.padEnd(80));
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  readline.cursorTo(process.stdout, 0);
  readline.clearLine(process.stdout, 0);
  console.log(`Bắt đầu vòng lặp mới...`);
}

async function main() {
  console.log(colors.yellow("Tool được phát triển bởi nhóm tele Airdrop Hunter Siêu Tốc (https://t.me/airdrophuntersieutoc)"));

  const { endpoint: hasIDAPI, message } = await checkBaseUrl();
  if (!hasIDAPI) return console.log(`Không thể tìm thấy ID API, thử lại sau!`.red);
  console.log(`${message}`.yellow);

  const data = loadData("data.txt");

  const maxThreads = settings.MAX_THEADS_NO_PROXY;
  while (true) {
    for (let i = 0; i < data.length; i += maxThreads) {
      const batch = data.slice(i, i + maxThreads);

      const promises = batch.map(async (initData, indexInBatch) => {
        const accountIndex = i + indexInBatch;
        const userData = JSON.parse(decodeURIComponent(initData.split("user=")[1].split("&")[0]));
        const firstName = userData.first_name || "";
        const lastName = userData.last_name || "";
        const session_name = userData.id;

        console.log(`=========Tài khoản ${accountIndex + 1}| ${firstName + " " + lastName}`.green);
        const client = new ClientAPI(accountIndex, initData, session_name, hasIDAPI);
        client.set_headers();

        return timeout(client.processAccount(), 24 * 60 * 60 * 1000).catch((err) => {
          client.log(`Lỗi xử lý tài khoản: ${err.message}`, "error");
        });
      });
      await Promise.allSettled(promises);
    }
    await updateEnv("AUTO_CODE_GATEWAY", "false");
    await sleep(5);
    console.log(`Hoàn thành tất cả tài khoản | Chờ ${settings.TIME_SLEEP} phút=============`.magenta);
    if (settings.AUTO_SHOW_COUNT_DOWN_TIME_SLEEP) {
      await wait(settings.TIME_SLEEP * 60);
    } else {
      await sleep(settings.TIME_SLEEP * 60);
    }
  }
}

function timeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timeout"));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
