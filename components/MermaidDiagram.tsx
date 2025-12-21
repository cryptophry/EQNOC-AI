import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface Props {
  chart: string;
}

const MermaidDiagram: React.FC<Props> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      fontFamily: 'Rajdhani',
      themeVariables: {
        primaryColor: '#0f172a',
        primaryTextColor: '#22d3ee',
        primaryBorderColor: '#06b6d4',
        lineColor: '#22d3ee',
        secondaryColor: '#164e63',
        tertiaryColor: '#0f172a',
      }
    });
  }, []);

  useEffect(() => {
    const renderChart = async () => {
      if (!chart || !containerRef.current) return;
      try {
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await mermaid.render(id, chart);
        setSvg(svg);
      } catch (error) {
        console.error('Mermaid render error:', error);
        setSvg(`<div style="color:red; font-family:monospace">Syntax Error in Graph Definition</div>`);
      }
    };
    renderChart();
  }, [chart]);

  return (
    <div 
      ref={containerRef}
      className="w-full flex justify-center bg-slate-950/50 p-4 rounded-lg border border-slate-800 overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

export default MermaidDiagram;