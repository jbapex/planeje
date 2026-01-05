import React, { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, XCircle, Image as ImageIcon } from 'lucide-react';

const TestImageModels = () => {
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState(null);

  const testModels = async () => {
    setTesting(true);
    setResults(null);

    try {
      const { data, error } = await supabase.functions.invoke('test-image-models', {
        body: {},
      });

      if (error) {
        throw error;
      }

      setResults(data);
    } catch (error) {
      console.error('Erro ao testar modelos:', error);
      setResults({
        success: false,
        error: error.message || 'Erro ao testar modelos',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Teste de Modelos de Geração de Imagem
          </CardTitle>
          <CardDescription>
            Testa quais modelos de geração de imagem estão disponíveis na sua conta OpenAI
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={testModels}
            disabled={testing}
            className="w-full"
          >
            {testing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Testando modelos...
              </>
            ) : (
              'Testar Modelos Disponíveis'
            )}
          </Button>

          {results && (
            <div className="space-y-4 mt-6">
              {results.error ? (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-red-600 dark:text-red-400 font-semibold">Erro:</p>
                  <p className="text-red-500 dark:text-red-300">{results.error}</p>
                </div>
              ) : (
                <>
                  {results.summary && (
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Resumo:</h3>
                      <div className="space-y-1">
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                          <strong>Disponíveis:</strong> {results.summary.available.length > 0 ? results.summary.available.join(', ') : 'Nenhum'}
                        </p>
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          <strong>Indisponíveis:</strong> {results.summary.unavailable.length > 0 ? results.summary.unavailable.join(', ') : 'Nenhum'}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {results.results?.map((result, index) => (
                      <div
                        key={index}
                        className={`p-4 rounded-lg border ${
                          result.available
                            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                            : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              {result.available ? (
                                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                              ) : (
                                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                              )}
                              <h4 className="font-semibold">{result.name}</h4>
                              <span className="text-xs text-gray-500 dark:text-gray-400">({result.model})</span>
                            </div>
                            {result.available ? (
                              <div className="space-y-2">
                                <p className="text-sm text-green-700 dark:text-green-300">{result.message}</p>
                                {result.imageUrl && (
                                  <div className="mt-2">
                                    <img
                                      src={result.imageUrl}
                                      alt="Teste de geração"
                                      className="max-w-xs rounded-lg border border-gray-200 dark:border-gray-700"
                                    />
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-red-600 dark:text-red-400">
                                <strong>Erro:</strong> {result.error}
                                {result.code && ` (Código: ${result.code})`}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TestImageModels;

