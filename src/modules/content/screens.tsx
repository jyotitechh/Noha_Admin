/* The tabs of Content, Media and School. Each is one ContentManager, told which
   kinds of content it holds; the screen itself is drawn from the server's
   definitions (server/content-types.js), so none of them has fields of its own. */

import { ContentManager } from './ContentManager';

export const Manna = () => <ContentManager types={['manna', 'mannaCategories']} />;
export const Prayers = () => <ContentManager types={['prayers']} />;
export const Confessions = () => <ContentManager types={['confessions']} />;
export const Dictionary = () => <ContentManager types={['dictionary', 'dictionaryCategories']} />;
export const Announce = () => <ContentManager types={['banners', 'announcements']} />;

export const Noahgram = () => <ContentManager types={['noahgramPosts', 'noahgramCategories']} />;
export const NoahTube = () => <ContentManager types={['tubeVideos', 'tubeCategories']} />;

export const BibleSchool = () => <ContentManager types={['bibleSchools']} />;
export const BibleStudy = () => <ContentManager types={['bibleStudies', 'bibleStudySteps', 'bibleStudyQuizzes']} />;
export const Courses = () => <ContentManager types={['courses', 'courseCategories', 'courseSections', 'courseLessons']} />;
