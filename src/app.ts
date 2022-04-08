import express from "express";
import path = require("path");
import cors from "cors";
import * as bodyParser from "body-parser";
import fs from "fs";
import { google } from "googleapis";
import mime = require("mime-types");

const KEY_FILE_PATH = "stoked-edition-321008-b98c9ee06b80.json";
const SCOPES = ["https://www.googleapis.com/auth/drive"];
const PARENTS = ["19gagtCwtJ67LhjnPh3QdgnSrzrQjbCrw"];
const AUTH = new google.auth.GoogleAuth({
  keyFile: KEY_FILE_PATH,
  scopes: SCOPES,
});

const main = async () => {
  const app = express();

  app.use(cors("*"));
  app.use(express.json());
  app.use(bodyParser.urlencoded({ extended: false }));

  app.post("/upload", checkExistsDirectory, async (req, res) => {
    if (!req.body.directoryPath || !req.body.parents)
      return res
        .status(400)
        .json({ status: "FAIL", msg: "Insufficient parameter" });

    const { directoryPath, parents } = req.body;

    const directoryLink = await uploadDirectory(AUTH, directoryPath, parents);
    return res.status(200).json({ status: "OK", directoryLink });
  });

  const port = 4000;
  app.listen(port, () => console.log(`Server is listening at port ${port}`));
};

const checkExistsDirectory = async (req, res, next) => {
  if (fs.existsSync(req.body.directoryPath)) {
    return next();
  }
  return res
    .status(404)
    .json({ status: "FAIL", msg: "Directory is not found" });
};

const listDirectory = async (
  directoryPath: string
): Promise<{ directoryList: string[]; fileList: string[] }> => {
  const directoryList = fs
    .readdirSync(directoryPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
  const fileList = fs.readdirSync(directoryPath);
  return { directoryList, fileList };
};

const listAllFiles = async (directoryPath: string): Promise<string[]> => {
  let isSubDirectory = false;
  let allFileList = [];
  let { directoryList, fileList } = await listDirectory(directoryPath);
  fileList = fileList.map((file) => path.join(directoryPath, file));

  allFileList = [...allFileList, ...fileList];
  isSubDirectory = directoryList.length > 0;

  directoryList = directoryList.map((directory) =>
    path.join(directoryPath, directory)
  );
  console.log({ fileList, directoryList });

  let subDirectory = [...directoryList];
  while (isSubDirectory) {
    isSubDirectory = false;
    let initial = subDirectory.length;
    for (let folder of subDirectory) {
      console.log("-----", folder);
      let { directoryList, fileList } = await listDirectory(folder);
      let newFileList = fileList.map((file) => path.join(folder, file));

      allFileList = [...allFileList, ...newFileList];

      let newDirectoryList = directoryList.map((directory) =>
        path.join(folder, directory)
      );

      if (newDirectoryList.length > 0) {
        isSubDirectory = true;
        subDirectory = [...subDirectory, ...newDirectoryList];
      }
      subDirectory = subDirectory.slice(initial);
    }
  }

  return allFileList;
};

const uploadDirectory = async (
  auth,
  directoryPath: string,
  parents: string[]
): Promise<string> => {
  const filesList = await listAllFiles(directoryPath);
  filesList.map(async (file) => {
    const fileStream = fs.createReadStream(file);
    return await uploadFile(auth, fileStream, path.basename(file), parents);
  });
  return `https://drive.google.com/drive/folders/${parents[0]}?usp=sharing`;
};

const uploadFile = async (
  auth,
  file: any,
  fileName: string,
  parents: string[]
): Promise<string> => {
  const driveService = google.drive({ version: "v3", auth });
  const fileMetadata = {
    name: fileName,
    parents,
  };
  const media = {
    mimeType: mime.lookup(fileName),
    body: file,
  };
  try {
    const res = await driveService.files.create({
      requestBody: fileMetadata,
      media,
    });

    return res.data.id;
  } catch (error) {
    console.log(error);
    return null;
  }
};

main();
