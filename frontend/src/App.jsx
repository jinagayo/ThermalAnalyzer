import { useState } from "react";

function App(){
  const [selectedFile, setSelectedFile] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSelectTmx(){
    try{
      setErrorMessage("");

      const result = await window.thermalApi.selectTmxFile();

      if (!result){
        return;
      }

      console.log("파일 선택 결과:", result);
      setSelectedFile(result);
    
    }catch (error){
      console.error(error);
      setErrorMessage(
        "TMX 파일을 선택하는 중 오류가 발생했습니다."
      );
    }
  }

  return (
    <main>
      <h1>Thermal Analyzer</h1>

      <button onClick={handleSelectTmx}>
        TMX 파일 선택 
      </button>

      {selectedFile && (
        <section>
          <p> 파일 이름 : {selectedFile.fileName}</p>
          <p> 파일 경로 : {selectedFile.tmxPath}</p>
          <p> 캐시 경로 : {selectedFile.cacheRoot}</p>
        </section>
      )}

      {errorMessage && <p>{errorMessage}</p>}
    </main>
  )
}

export default App;