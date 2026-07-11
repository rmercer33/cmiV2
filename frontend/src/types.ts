// types.ts - cmiLibrary TypeScript Definitions

export interface LibraryIndex {
  title: string;
  description: string;
  contact?: string;
  email?: string;
  sources: string[];
  sourceInfo: {
    [sourceId: string]: {
      title: string;
      description: string;
      books: string[];
      image?: string; // Source logo or cover URL
    };
  };
}

export interface UnitInfo {
  title: string;
  url: string;
  audio?: boolean;
  chapter?: string;
  ctitle?: string;
  ref?: string;
  [key: string]: any; // Allow custom flexible frontmatter fields
}

export interface GroupInfo {
  title: string;
  units: string[];
  unitInfo: {
    [unitId: string]: UnitInfo;
  };
}

export interface BookInfo {
  title: string;
  description: string;
  image?: string; // Book cover image URL
  groups?: string[];
  groupInfo?: {
    [groupId: string]: GroupInfo;
  };
  units?: string[];
  unitInfo?: {
    [unitId: string]: UnitInfo;
  };
}

export interface SourceInfo {
  title: string;
  description: string;
  image?: string; // Source logo or cover URL
  website?: string;
  contact?: string;
  email1?: string;
  email2?: string;
  copyright?: string;
  books: string[];
  bookInfo: {
    [bookId: string]: BookInfo;
  };
}
