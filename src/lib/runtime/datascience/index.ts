// The Analytical Engine's runtime: a deck of datasets, a schema profiler, and the
// Mill (a sandboxed dataframe interpreter). All browser- and Node-safe except the
// Mill client, which spawns a Web Worker.

export { runUserCode, type Row, type MillResult } from './mill';
export { Mill } from './mill-client';
export {
	DATASETS,
	loadDataset,
	parseData,
	parseUploaded,
	slugify,
	dataPath,
	type DatasetSpec,
	type DatasetFormat,
	type LoadedDataset
} from './datasets';
export {
	profileDataset,
	profileColumn,
	inferColumnType,
	columnNames,
	describeSchema,
	type ColumnType,
	type ColumnProfile,
	type DatasetProfile
} from './frame';
