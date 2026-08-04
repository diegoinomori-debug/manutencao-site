import React from "react";

export default function SimilarProblems({
  problems = [],
  onOpenReport,
}) {

  if (problems.length === 0) {

    return (
      <div className="bg-white rounded-xl shadow p-5 mt-5">

        <h2 style={{fontSize:24}}>
          🤖 MIYAMA AI
        </h2>

        <p>Nenhum problema semelhante encontrado.</p>

      </div>
    );

  }

  return (

    <div
      className="bg-white rounded-xl shadow p-5 mt-5"
    >

      <h2
        style={{
          fontSize:24,
          marginBottom:20
        }}
      >
        🤖 MIYAMA AI
      </h2>

      <h3>

        Problemas semelhantes encontrados

      </h3>

      {problems.map((problem,index)=>(

        <div

          key={problem.id || index}

          style={{

            border:"1px solid #ddd",

            borderRadius:10,

            padding:15,

            marginTop:15

          }}

        >

          <h2>

            {problem.similarity}% semelhante

          </h2>

          <p>

            <b>Equipamento:</b>

            {problem.equipment}

          </p>

          <p>

            <b>Fenômeno:</b>

            {problem.phenomenon}

          </p>

          <p>

            <b>Causa:</b>

            {problem.why1}

          </p>

          <p>

            <b>Solução:</b>

            {problem.action}

          </p>

          <button

            onClick={()=>onOpenReport?.(problem)}

            style={{

              background:"#2563eb",

              color:"white",

              border:"none",

              borderRadius:8,

              padding:"10px 20px",

              cursor:"pointer"

            }}

          >

            Abrir relatório

          </button>

        </div>

      ))}

    </div>

  );

}