// 테스트에서 파일 내용을 글로 가져온다(Vite의 ?raw).
declare module '*?raw' {
  const content: string;
  export default content;
}
