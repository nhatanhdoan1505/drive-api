import express from "express";
import path = require("path");
import cors from "cors";
import * as bodyParser from "body-parser";
import fs from "fs";
import { drive_v3, google } from "googleapis";
import mime = require("mime-types");

const KEY_FILE_PATH = "stoked-edition-321008-b98c9ee06b80.json";
const SCOPES = ["https://www.googleapis.com/auth/drive"];
const PARENTS = ["19gagtCwtJ67LhjnPh3QdgnSrzrQjbCrw"];
const AUTH = new google.auth.GoogleAuth({
  keyFile: KEY_FILE_PATH,
  scopes: SCOPES,
});
import * as HTML_TO_PDF from "html-pdf";

const main = async () => {
  const app = express();

  app.use(cors("*"));
  app.use(express.json());
  app.use(bodyParser.urlencoded({ extended: false }));

  app.post("/upload", checkExistsDirectory, async (req, res) => {
    if (!req.body.filePath || !req.body.parents)
      return res
        .status(400)
        .json({ status: "FAIL", msg: "Insufficient parameter" });

    const { filePath, parents } = req.body;
    const fileStream = fs.createReadStream(filePath);

    const id = await uploadFile(
      AUTH,
      fileStream,
      path.basename(filePath),
      parents
    );
    let link = `https://drive.google.com/file/d/${id}/view`;
    return res.status(200).json({ status: "OK", link });
  });

  app.post("/convert", async (req, res) => {
    if (!req.body.fileList)
      return res
        .status(400)
        .json({ status: "FAIL", msg: "Insufficient parameter" });

    const { fileList } = req.body;
    const pdfList = await convertHTMLtoPDFList(fileList as string[]);
    return res.status(200).json({ status: "OK", pdfList });
  });

  const port = 4000;
  app.listen(port, () => console.log(`Server is listening at port ${port}`));
};

const checkExistsDirectory = async (req, res, next) => {
  if (fs.existsSync(req.body.filePath)) {
    return next();
  }
  return res.status(404).json({ status: "FAIL", msg: "File is not found" });
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

  let subDirectory = [...directoryList];
  while (isSubDirectory) {
    isSubDirectory = false;
    let initial = subDirectory.length;
    for (let folder of subDirectory) {
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
): Promise<string[]> => {
  const filesList = await listAllFiles(directoryPath);
  let fileIdListPromise = filesList.map((file) => {
    const fileStream = fs.createReadStream(file);
    return uploadFile(auth, fileStream, path.basename(file), parents);
  });
  let fileIdList = await Promise.all(fileIdListPromise);
  fileIdList = fileIdList.map(
    (id) => `https://drive.google.com/file/d/${id}/view`
  );
  return fileIdList;
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

    await getPublicLink(driveService, res.data.id);
    return res.data.id;
  } catch (error) {
    return null;
  }
};

const getPublicLink = async (driveService: drive_v3.Drive, fileId: string) => {
  try {
    const res = await driveService.permissions.create({
      fileId,
      requestBody: {
        role: "writer",
        type: "anyone",
      },
    });
    return res;
  } catch (error) {
    return null;
  }
};

const convertHTMLtoPDFList = async (htmlPathList: string[]) => {
  let htmlFileList = htmlPathList
    .map((f) => {
      if (fs.existsSync(f) && path.extname(f) === ".html") {
        return { file: fs.readFileSync(f, "utf8").toString(), filePath: f };
      }
      return null;
    })
    .filter((f) => f);

  console.log(htmlFileList);
  const pdfListPromise = htmlFileList.map((f) => convertHTMLtoPDF({ ...f }));
  return await Promise.all(pdfListPromise);
};

const convertHTMLtoPDF = ({
  file,
  filePath,
}: {
  file: string;
  filePath: string;
}) =>
  new Promise<string>((resolve, reject) => {
    console.log(file);
    HTML_TO_PDF.create(file, { format: "A4" }).toFile(
      filePath.replace(".html", ".pdf"),
      (err, res) => {
        console.log(res.filename);
        resolve(res.filename);
      }
    );
  });

main();
