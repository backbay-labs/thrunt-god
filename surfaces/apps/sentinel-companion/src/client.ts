/**
 * @thrunt-surfaces/sentinel-companion — Workbook templates and playbook skeletons
 * for Microsoft Sentinel integration with THRUNT hunt workflows.
 */

import { SurfaceClient, type SurfaceClientOptions } from '@thrunt-surfaces/sdk';

export interface WorkbookTemplate {
  /** ARM template schema version */
  $schema: string;
  /** Azure Workbook version */
  version: string;
  /** Display name for the workbook */
  name: string;
  /** Workbook description */
  description: string;
  /** Workbook items (panels, queries, visualizations) */
  items: WorkbookItem[];
}

export interface WorkbookItem {
  type: 'query' | 'text' | 'metric';
  name: string;
  content: Record<string, unknown>;
}

export interface PlaybookSkeleton {
  /** ARM template schema */
  $schema: string;
  /** Logic App definition */
  definition: {
    /** Workflow schema */
    $schema: string;
    triggers: Record<string, unknown>;
    actions: Record<string, unknown>;
  };
  /** Playbook metadata */
  metadata: {
    name: string;
    description: string;
    triggerType: string;
  };
}

export class SentinelCompanion {
  protected readonly bridge: SurfaceClient;

  constructor(options?: SurfaceClientOptions) {
    this.bridge = new SurfaceClient(options);
  }

  /**
   * Generate a JSON skeleton for an Azure Workbook that displays THRUNT case data.
   *
   * The template includes panels for case summary, hypothesis tracking,
   * query log timeline, and findings overview. It is meant to be imported
   * into Sentinel as a custom workbook or deployed via ARM template.
   */
  generateWorkbookTemplate(): WorkbookTemplate {
    return {
      $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
      version: '1.0.0',
      name: 'THRUNT Hunt Case Overview',
      description: 'Workbook template for visualizing THRUNT threat hunt case data within Microsoft Sentinel.',
      items: [
        {
          type: 'text',
          name: 'Case Header',
          content: {
            text: '## THRUNT Hunt Case\nThis workbook displays data from an active THRUNT threat hunt case, bridged via the surface-bridge API.',
          },
        },
        {
          type: 'query',
          name: 'Hunt Progress',
          content: {
            queryType: 'custom_api',
            apiEndpoint: '/api/case/progress',
            visualization: 'progressbar',
            description: 'Displays current hunt phase progress from the THRUNT case state.',
          },
        },
        {
          type: 'query',
          name: 'Hypotheses Status',
          content: {
            queryType: 'custom_api',
            apiEndpoint: '/api/case/hypotheses',
            visualization: 'table',
            columns: ['id', 'assertion', 'priority', 'status', 'confidence'],
            description: 'Table of hunt hypotheses and their current disposition.',
          },
        },
        {
          type: 'query',
          name: 'Recent Queries',
          content: {
            queryType: 'custom_api',
            apiEndpoint: '/api/case/queries',
            visualization: 'timeline',
            timeField: 'executedAt',
            description: 'Timeline of queries executed during the hunt.',
          },
        },
        {
          type: 'query',
          name: 'Findings Summary',
          content: {
            queryType: 'custom_api',
            apiEndpoint: '/api/case/findings',
            visualization: 'table',
            columns: ['title', 'severity', 'confidence', 'recommendation'],
            description: 'Findings produced by the hunt with severity and recommended actions.',
          },
        },
        {
          type: 'query',
          name: 'Sentinel Incident Correlation',
          content: {
            queryType: 'kusto',
            query: [
              'SecurityIncident',
              '| where TimeGenerated > ago(7d)',
              '| project IncidentNumber, Title, Severity, Status, CreatedTime',
              '| order by CreatedTime desc',
              '| take 50',
            ].join('\n'),
            visualization: 'table',
            description: 'Recent Sentinel incidents for cross-referencing with hunt hypotheses.',
          },
        },
      ],
    };
  }

  /**
   * Generate a JSON skeleton for a Logic App playbook that can be triggered
   * from Sentinel incidents to create or update THRUNT hunt cases.
   *
   * The skeleton includes the trigger configuration and placeholder actions
   * for calling the surface-bridge API.
   */
  generatePlaybookSkeleton(): PlaybookSkeleton {
    return {
      $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
      definition: {
        $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
        triggers: {
          'Microsoft_Sentinel_incident': {
            type: 'ApiConnectionWebhook',
            inputs: {
              body: {
                callback_url: '@{listCallbackUrl()}',
              },
              host: {
                connection: {
                  name: '@parameters($connections)[azuresentinel][connectionId]',
                },
              },
              path: '/incident-creation',
            },
            description: 'Triggered when a new Sentinel incident is created.',
          },
        },
        actions: {
          'Extract_Incident_Details': {
            type: 'Compose',
            inputs: {
              incidentId: '@triggerBody()?[\'object\']?[\'properties\']?[\'incidentNumber\']',
              title: '@triggerBody()?[\'object\']?[\'properties\']?[\'title\']',
              severity: '@triggerBody()?[\'object\']?[\'properties\']?[\'severity\']',
              description: '@triggerBody()?[\'object\']?[\'properties\']?[\'description\']',
            },
            runAfter: {},
            description: 'Extract incident metadata for THRUNT case creation.',
          },
          'Call_THRUNT_Bridge_Open_Case': {
            type: 'Http',
            inputs: {
              method: 'POST',
              uri: 'http://127.0.0.1:7483/api/case/open',
              headers: {
                'Content-Type': 'application/json',
              },
              body: {
                signal: '@{outputs(\'Extract_Incident_Details\')?[\'title\']} - @{outputs(\'Extract_Incident_Details\')?[\'description\']}',
                mode: 'case',
                vendorContext: {
                  vendorId: 'sentinel',
                  consoleName: 'Microsoft Sentinel',
                  pageUrl: 'https://portal.azure.com/#/sentinel/incidents',
                  pageTitle: 'Sentinel Incident',
                  extracted: '@outputs(\'Extract_Incident_Details\')',
                  capturedAt: '@utcNow()',
                },
              },
            },
            runAfter: {
              'Extract_Incident_Details': ['Succeeded'],
            },
            description: 'Open a THRUNT hunt case from the Sentinel incident via the surface-bridge API.',
          },
          'Update_Incident_Tags': {
            type: 'ApiConnection',
            inputs: {
              body: {
                tagsToAdd: {
                  TagsToAdd: [{ Tag: 'thrunt-case-opened' }],
                },
              },
              host: {
                connection: {
                  name: '@parameters($connections)[azuresentinel][connectionId]',
                },
              },
              method: 'put',
              path: '/Incidents',
            },
            runAfter: {
              'Call_THRUNT_Bridge_Open_Case': ['Succeeded'],
            },
            description: 'Tag the Sentinel incident to indicate a THRUNT case was opened.',
          },
        },
      },
      metadata: {
        name: 'THRUNT-Sentinel-Incident-To-Case',
        description: 'Logic App playbook triggered by Sentinel incidents to open THRUNT hunt cases via the surface-bridge API.',
        triggerType: 'Microsoft Sentinel incident',
      },
    };
  }
}
