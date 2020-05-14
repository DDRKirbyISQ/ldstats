import deb from "debug";

import { compact, get } from "lodash";

import axios from "axios";
import LudumDareById from "./ludumDateAPIs";

const debug = deb("ldstats:new-api");

class LudumDareAPI {
  ssl = false;
  version = "x";

  constructor(options) {
    if (options) {
      this.ssl = options.ssl || this.ssl;
      this.version = options.version || this.version;
    }
  }

  getUrl = () =>
    `${this.ssl ? "https" : "http"}://api.ldjam.com/v${this.version}`;

  getLDId = (response) => get(response, "data.node[0].parent");

  isExpectedType = (response) =>
    ["jam", "compo"].includes(get(response, "data.node[0].subsubtype"));

  parseUser = (username) => ({ data }) => {
    let { path, extra, node } = data;

    if (path[0] === node && extra[0] === username) {
      let error = new Error("Username Not Found");
      error.status = 404;
      throw error;
    }

    return node; // user id
  };

  setConfig = (response) => ({
    config: LudumDareById[this.getLDId(response)],
    response,
  });

  parseEntry = ({ response, config }) => {
    let { ludum, grades } = config;
    let [entry] = response.data.node;

    let { scores, ranking } = Object.keys(grades).reduce(
      (result, key) => {
        let category = grades[key].toLowerCase();
        result.scores[category] = get(entry, `magic.${key}-average`, 0);
        result.ranking[category] = get(entry, `magic.${key}-result`, 0);
        return result;
      },
      {
        scores: {},
        ranking: {},
      }
    );

    return {
      ludum,
      title: entry.name,
      type: entry.subsubtype,
      link: `https://ldjam.com${entry.path}`,
      coolness: Math.round(get(entry, "magic.cool", 0)),
      scores,
      ranking,
    };
  };

  // resolves a user id from a username
  user = (username) =>
    axios
      .get(`${this.getUrl()}/node/walk/1/users/${username}`)
      .then(this.parseUser(username));

  // resolves an array of id entries from a user id
  userEntries = (userId) =>
    axios
      .get(`${this.getUrl()}/node/feed/${userId}/authors/item/game?limit=12`)
      .then(({ data }) => data.feed.map((entry) => entry.id));

  // hidratates an array of entries ids with entry data
  fulfillEntries = (entries) =>
    Promise.all(entries.map(this.entry)).then((result) => compact(result));

  // resolves an entry by id
  entry = (id) =>
    axios
      .get(`${this.getUrl()}/node/get/${id}`)
      .then((res) =>
        LudumDareById[this.getLDId(res)]
          ? res
          : Promise.reject(new Error("UNKNOWN-LUDUM-DARE"))
      )
      .then((res) =>
        this.isExpectedType(res)
          ? res
          : Promise.reject(new Error("UNKNOWN-ENTRY-TYPE"))
      )
      .then(this.setConfig)
      .then(this.parseEntry)
      .catch((error) => {
        if (error.message === "UNKNOWN-LUDUM-DARE") {
          debug("Unexpected LD");
          return;
        }

        if (error.message === "UNKNOWN-ENTRY-TYPE") {
          debug("Not a finished Compo or Jam game");
          return;
        }

        return Promise.reject(error);
      });

  static use = (options) => new LudumDareAPI(options);
}

export default LudumDareAPI;
